//! Custodial identities: an SSO subject mapped to a Nostr keypair.
//!
//! # Why this exists
//!
//! Buzz signs every write with the author's key, which is the right model when
//! nobody trusts the server. It is the wrong model for an organisation: a person
//! who loses their key loses their identity, and there is no one to ask for it
//! back. Slack does not have that problem because Slack has no user-held key at
//! all — identity is an account the organisation owns, and the credential is a
//! revocable session.
//!
//! This module takes that shape without giving up the signed event log. The
//! person authenticates with their identity provider; the relay holds the key and
//! signs on their behalf. Everything downstream — the audit hash chain, agent
//! owner attestation, git signing — keeps working because the events are still
//! signed by a per-person key.
//!
//! # The trade this makes, stated plainly
//!
//! The relay can now forge events as any custodial user. That is a real loss of
//! the self-custody property, and it must be a deliberate choice rather than an
//! accident: it is exactly the authority Slack's server already has, so for a
//! Slack replacement it is an acceptable trade — but a deployment that wants
//! self-custody should leave this disabled and keep using NIP-07. Both models
//! coexist; nothing here removes the self-custody path.
//!
//! # Nothing secret is stored
//!
//! Secret keys are **derived on demand** from a master key, never written to the
//! database. The only stored material is the public key and the provider
//! mapping, so a database dump contains no key material at all.
//!
//! ```text
//! sk = HKDF-SHA256(
//!     ikm  = master key for this version,
//!     salt = community id,
//!     info = "nuxx-custodial-v1" || issuer || 0x00 || subject || counter,
//! )
//! ```
//!
//! Two consequences worth being explicit about:
//!
//! - **The identity anchor is `(issuer, subject)`, never email.** An OIDC `sub`
//!   is stable for the life of the account; an email address is not — people get
//!   married, get renamed, change domains. Anchoring on email would silently turn
//!   a renamed employee into a different person with a different history.
//! - **Rotating the master key would re-derive every identity**, so the master
//!   key is *versioned*. A rotation introduces a new version used for new
//!   identities; existing ones record the version they were minted under and
//!   keep resolving to the same key forever.

use nostr::{Keys, SecretKey};
use uuid::Uuid;
use zeroize::Zeroize;

use crate::identity::hkdf;

/// Domain separation label. Changing this re-derives every identity, so it is
/// versioned and must not be edited in place.
const DERIVATION_LABEL: &[u8] = b"nuxx-custodial-v1";

/// A provider-issued identity, before it is mapped to a key.
///
/// `issuer` and `subject` come from the verified `id_token` and are the only
/// fields that participate in derivation. `email` is carried alongside for
/// display and administration and is deliberately *not* an input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderIdentity {
    /// OIDC `iss` — subjects are only unique within one issuer.
    pub issuer: String,
    /// OIDC `sub` — stable for the life of the provider account.
    pub subject: String,
    /// For display and administration only. Never an input to derivation.
    pub email: Option<String>,
}

/// A versioned master key.
///
/// Held as a keyring so a rotation does not invalidate identities minted under
/// an earlier version.
#[derive(Clone)]
pub struct MasterKeyring {
    /// Version used for identities minted from now on.
    current_version: i32,
    /// version → key material.
    keys: std::collections::HashMap<i32, Vec<u8>>,
}

/// Why a derivation could not be performed.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum CustodialError {
    /// An identity records a key version this deployment no longer configures.
    /// Retiring a version strands every identity minted under it.
    #[error("no custodial master key is configured for version {0}")]
    UnknownKeyVersion(i32),
    /// Refused at construction rather than at first login, so a misconfigured
    /// deployment cannot mint weak identities that later need migrating.
    #[error("custodial master key for version {0} is too short; need at least 32 bytes")]
    MasterKeyTooShort(i32),
    /// The verified token carried no usable `iss`/`sub` pair.
    #[error("provider identity is missing issuer or subject")]
    IncompleteIdentity,
    /// Every counter produced an invalid scalar — cryptographically impossible
    /// in practice, kept as a real error rather than a panic.
    #[error("could not derive a valid secp256k1 key")]
    DerivationFailed,
}

impl MasterKeyring {
    /// Build a keyring from `(version, key)` pairs, marking `current` as the
    /// version new identities are minted under.
    pub fn new(
        entries: impl IntoIterator<Item = (i32, Vec<u8>)>,
        current: i32,
    ) -> Result<Self, CustodialError> {
        let keys: std::collections::HashMap<i32, Vec<u8>> = entries.into_iter().collect();
        for (version, key) in &keys {
            // 32 bytes is the SHA-256 block security level; a shorter master key
            // would silently weaken every identity derived from it.
            if key.len() < 32 {
                return Err(CustodialError::MasterKeyTooShort(*version));
            }
        }
        if !keys.contains_key(&current) {
            return Err(CustodialError::UnknownKeyVersion(current));
        }
        Ok(Self {
            current_version: current,
            keys,
        })
    }

    /// The version new identities should be minted under.
    pub fn current_version(&self) -> i32 {
        self.current_version
    }

    fn key_for(&self, version: i32) -> Result<&[u8], CustodialError> {
        self.keys
            .get(&version)
            .map(Vec::as_slice)
            .ok_or(CustodialError::UnknownKeyVersion(version))
    }
}

/// Derive the keypair for one identity under one key version.
///
/// The counter in `info` exists because HKDF output is uniform bytes, which are
/// not guaranteed to be a valid secp256k1 scalar (zero, or at/above the group
/// order). Those cases are astronomically rare but not impossible, so the
/// derivation walks the counter until a valid key appears rather than failing —
/// which would leave one unlucky person permanently unable to sign.
pub fn derive_keys(
    keyring: &MasterKeyring,
    key_version: i32,
    community: Uuid,
    identity: &ProviderIdentity,
) -> Result<Keys, CustodialError> {
    if identity.issuer.is_empty() || identity.subject.is_empty() {
        return Err(CustodialError::IncompleteIdentity);
    }
    let master = keyring.key_for(key_version)?;

    for counter in 0u8..=255 {
        let mut info = Vec::with_capacity(
            DERIVATION_LABEL.len() + identity.issuer.len() + identity.subject.len() + 3,
        );
        info.extend_from_slice(DERIVATION_LABEL);
        info.push(0x00);
        info.extend_from_slice(identity.issuer.as_bytes());
        // A NUL separator keeps ("a", "bc") from colliding with ("ab", "c").
        info.push(0x00);
        info.extend_from_slice(identity.subject.as_bytes());
        info.push(counter);

        let mut secret = [0u8; 32];
        hkdf::derive(master, community.as_bytes(), &info, &mut secret)
            .map_err(|_| CustodialError::DerivationFailed)?;

        let parsed = SecretKey::from_slice(&secret);
        secret.zeroize();
        if let Ok(secret_key) = parsed {
            return Ok(Keys::new(secret_key));
        }
    }
    Err(CustodialError::DerivationFailed)
}

impl Drop for MasterKeyring {
    fn drop(&mut self) {
        for key in self.keys.values_mut() {
            key.zeroize();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keyring() -> MasterKeyring {
        MasterKeyring::new([(1, vec![0x11; 32]), (2, vec![0x22; 32])], 2).unwrap()
    }

    fn identity(subject: &str) -> ProviderIdentity {
        ProviderIdentity {
            issuer: "https://accounts.google.com".into(),
            subject: subject.into(),
            email: Some("someone@example.com".into()),
        }
    }

    const COMMUNITY: Uuid = Uuid::from_u128(0x1111_2222_3333_4444_5555_6666_7777_8888);
    const OTHER_COMMUNITY: Uuid = Uuid::from_u128(0x9999_8888_7777_6666_5555_4444_3333_2222);

    #[test]
    fn the_same_person_always_gets_the_same_key() {
        // The whole point: a person who reinstalls their browser, or logs in from
        // a new laptop, is the same identity with the same history.
        let first = derive_keys(&keyring(), 1, COMMUNITY, &identity("sub-1")).unwrap();
        let second = derive_keys(&keyring(), 1, COMMUNITY, &identity("sub-1")).unwrap();
        assert_eq!(first.public_key(), second.public_key());
    }

    #[test]
    fn two_people_get_different_keys() {
        let alice = derive_keys(&keyring(), 1, COMMUNITY, &identity("sub-1")).unwrap();
        let bob = derive_keys(&keyring(), 1, COMMUNITY, &identity("sub-2")).unwrap();
        assert_ne!(alice.public_key(), bob.public_key());
    }

    #[test]
    fn email_is_not_part_of_the_identity() {
        // An OIDC `sub` is stable; an email is not. Anchoring on email would turn
        // a renamed employee into a stranger with none of their history.
        let before = ProviderIdentity {
            email: Some("old.name@example.com".into()),
            ..identity("sub-1")
        };
        let after = ProviderIdentity {
            email: Some("new.name@example.com".into()),
            ..identity("sub-1")
        };

        assert_eq!(
            derive_keys(&keyring(), 1, COMMUNITY, &before)
                .unwrap()
                .public_key(),
            derive_keys(&keyring(), 1, COMMUNITY, &after)
                .unwrap()
                .public_key(),
        );
    }

    #[test]
    fn the_same_subject_from_a_different_provider_is_a_different_person() {
        // Subjects are only unique within an issuer, so the issuer has to be part
        // of the derivation — otherwise Google's "12345" and an internal IdP's
        // "12345" would be the same account.
        let google = identity("12345");
        let other = ProviderIdentity {
            issuer: "https://login.microsoftonline.com/tenant/v2.0".into(),
            ..identity("12345")
        };

        assert_ne!(
            derive_keys(&keyring(), 1, COMMUNITY, &google)
                .unwrap()
                .public_key(),
            derive_keys(&keyring(), 1, COMMUNITY, &other)
                .unwrap()
                .public_key(),
        );
    }

    #[test]
    fn issuer_and_subject_cannot_be_confused_for_each_other() {
        // Without a separator, ("ab", "c") and ("a", "bc") would concatenate to
        // the same bytes and collapse into one identity.
        let first = ProviderIdentity {
            issuer: "ab".into(),
            subject: "c".into(),
            email: None,
        };
        let second = ProviderIdentity {
            issuer: "a".into(),
            subject: "bc".into(),
            email: None,
        };

        assert_ne!(
            derive_keys(&keyring(), 1, COMMUNITY, &first)
                .unwrap()
                .public_key(),
            derive_keys(&keyring(), 1, COMMUNITY, &second)
                .unwrap()
                .public_key(),
        );
    }

    #[test]
    fn one_person_is_a_different_identity_in_each_community() {
        // The community is the derivation salt, so a relay operator hosting two
        // tenants cannot correlate the same employee across them by pubkey.
        assert_ne!(
            derive_keys(&keyring(), 1, COMMUNITY, &identity("sub-1"))
                .unwrap()
                .public_key(),
            derive_keys(&keyring(), 1, OTHER_COMMUNITY, &identity("sub-1"))
                .unwrap()
                .public_key(),
        );
    }

    #[test]
    fn an_identity_keeps_its_key_after_a_rotation() {
        // A rotation must not change who anyone is. Version 1 identities keep
        // resolving under version 1 even though new ones mint under version 2.
        let ring = keyring();
        assert_eq!(ring.current_version(), 2);

        let under_v1 = derive_keys(&ring, 1, COMMUNITY, &identity("sub-1")).unwrap();
        let under_v2 = derive_keys(&ring, 2, COMMUNITY, &identity("sub-1")).unwrap();

        assert_ne!(
            under_v1.public_key(),
            under_v2.public_key(),
            "a new version must derive new material, or rotation is cosmetic"
        );
        // And v1 is still reachable, which is what makes rotation safe.
        assert_eq!(
            derive_keys(&ring, 1, COMMUNITY, &identity("sub-1"))
                .unwrap()
                .public_key(),
            under_v1.public_key(),
        );
    }

    #[test]
    fn a_retired_key_version_is_reported_not_guessed() {
        let ring = keyring();
        assert_eq!(
            derive_keys(&ring, 99, COMMUNITY, &identity("sub-1")),
            Err(CustodialError::UnknownKeyVersion(99)),
        );
    }

    #[test]
    fn a_short_master_key_is_refused_at_construction() {
        // Failing here rather than at first login means a misconfigured
        // deployment cannot mint weak identities that later have to be migrated.
        // `MasterKeyring` deliberately has no `Debug`, so key material cannot
        // reach a log line by accident — hence `matches!` rather than `assert_eq`.
        assert!(matches!(
            MasterKeyring::new([(1, vec![0u8; 31])], 1),
            Err(CustodialError::MasterKeyTooShort(1)),
        ));
    }

    #[test]
    fn a_current_version_with_no_key_is_refused() {
        assert!(matches!(
            MasterKeyring::new([(1, vec![0u8; 32])], 7),
            Err(CustodialError::UnknownKeyVersion(7)),
        ));
    }

    #[test]
    fn an_incomplete_identity_derives_nothing() {
        let ring = keyring();
        for broken in [
            ProviderIdentity {
                issuer: String::new(),
                subject: "sub".into(),
                email: None,
            },
            ProviderIdentity {
                issuer: "iss".into(),
                subject: String::new(),
                email: None,
            },
        ] {
            assert_eq!(
                derive_keys(&ring, 1, COMMUNITY, &broken),
                Err(CustodialError::IncompleteIdentity),
            );
        }
    }
}
