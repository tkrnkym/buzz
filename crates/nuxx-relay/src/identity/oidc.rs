//! `id_token` verification against an OpenID Connect provider.
//!
//! This is the only thing standing between a stranger and a signing key, so the
//! checks are deliberately explicit rather than delegated to defaults.
//!
//! # The three checks that actually matter
//!
//! **Algorithm allowlist.** A JWT names its own algorithm, which is the source of
//! the best-known attack on the format: an attacker re-signs the token with
//! `alg: HS256`, using the provider's *public* key as the HMAC secret, and a
//! verifier that trusts the header validates it. `alg: none` is the same attack
//! with no signature at all. Only asymmetric algorithms are accepted here, and
//! the header's claim is checked against the key's own family — never used to
//! select the verification mode.
//!
//! **Audience.** A token minted by the same provider for a *different*
//! application is a valid token. Without an `aud` check, anyone who can get a
//! Google `id_token` for any app could present it here. This is why the client id
//! is required configuration rather than optional.
//!
//! **Issuer.** Checked for exact equality against configuration, so a token from
//! some other provider — or from a look-alike issuer string — cannot authenticate.
//!
//! # Key rotation
//!
//! Providers rotate signing keys without notice, so the JWKS is cached with a TTL
//! and refetched when a token names an unknown `kid`. That refetch is itself a
//! denial-of-service lever — an attacker can mint tokens with random `kid`s — so
//! it is rate-limited to at most one refresh per [`JWKS_MIN_REFETCH`].

use std::sync::Arc;
use std::time::{Duration, Instant};

use jsonwebtoken::jwk::{AlgorithmParameters, JwkSet};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use tokio::sync::Mutex;

use crate::identity::custodial::ProviderIdentity;

/// How long a fetched JWKS is trusted before refetching.
pub const JWKS_TTL: Duration = Duration::from_secs(15 * 60);

/// Floor between forced refetches, so an unknown `kid` cannot be used to hammer
/// the provider through us.
pub const JWKS_MIN_REFETCH: Duration = Duration::from_secs(60);

/// Clock skew tolerated on `exp`/`iat`.
const LEEWAY_SECS: u64 = 60;

/// Signature algorithms this relay will accept on an `id_token`.
///
/// Asymmetric only. Including any HMAC variant would re-open the
/// public-key-as-HMAC-secret confusion described in the module docs, and
/// `Algorithm` has no `none` variant to exclude — `jsonwebtoken` refuses
/// unsigned tokens outright.
pub const ACCEPTED_ALGORITHMS: &[Algorithm] = &[
    Algorithm::RS256,
    Algorithm::RS384,
    Algorithm::RS512,
    Algorithm::PS256,
    Algorithm::PS384,
    Algorithm::PS512,
    Algorithm::ES256,
    Algorithm::ES384,
];

/// One configured identity provider.
#[derive(Debug, Clone)]
pub struct ProviderConfig {
    /// Expected `iss`, compared for exact equality.
    pub issuer: String,
    /// Expected `aud` — this deployment's client id at the provider.
    pub audience: String,
    /// Where to fetch signing keys.
    pub jwks_uri: String,
    /// Human-readable label for the login UI.
    pub label: String,
}

/// Why a token was refused.
#[derive(Debug, thiserror::Error)]
pub enum OidcError {
    /// The token's `iss` matches no configured provider.
    #[error("no identity provider is configured for issuer {0}")]
    UnknownIssuer(String),
    /// Not a JWT, or its header is not decodable.
    #[error("id_token header is unreadable: {0}")]
    MalformedHeader(String),
    /// Outside [`ACCEPTED_ALGORITHMS`], or disagreeing with the key's family.
    /// This is where the HMAC confusion attack is stopped.
    #[error("id_token names algorithm {0:?}, which is not accepted")]
    AlgorithmNotAccepted(Algorithm),
    /// No `kid`, so the signing key would have to be guessed.
    #[error("id_token has no key id, so its signing key cannot be identified")]
    MissingKeyId,
    /// The named key is absent — also the signal to refetch a rotated JWKS,
    /// which is why it is distinguishable from a generic rejection.
    #[error("no signing key matches key id {0}")]
    UnknownKeyId(String),
    /// The JWK was found but could not be turned into a verification key.
    #[error("signing key {0} cannot be used for verification: {1}")]
    UnusableKey(String, String),
    /// Signature, `exp`, `aud`, or `iss` validation failed.
    #[error("id_token rejected: {0}")]
    Invalid(String),
    /// Verified, but carries no `sub` to anchor an identity on.
    #[error("id_token carries no subject")]
    MissingSubject,
    /// The provider's key endpoint could not be reached or parsed.
    #[error("could not fetch signing keys: {0}")]
    JwksUnavailable(String),
}

/// Claims read out of a verified token.
#[derive(Debug, Deserialize)]
struct IdTokenClaims {
    iss: String,
    sub: String,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    email_verified: Option<bool>,
}

/// Pick the verification key for a token header.
///
/// Split out from the network path because every decision here is a security
/// decision and none of them needs a provider to be reachable to test.
///
/// A `kid` is required. Providers publish one on every key (Google, Microsoft,
/// Okta, Auth0 all do), and requiring it means the key is chosen by identity
/// rather than by trying candidates until one verifies.
pub fn select_key(
    header: &jsonwebtoken::Header,
    jwks: &JwkSet,
) -> Result<(DecodingKey, Algorithm), OidcError> {
    if !ACCEPTED_ALGORITHMS.contains(&header.alg) {
        return Err(OidcError::AlgorithmNotAccepted(header.alg));
    }
    let kid = header.kid.as_deref().ok_or(OidcError::MissingKeyId)?;
    let jwk = jwks
        .find(kid)
        .ok_or_else(|| OidcError::UnknownKeyId(kid.to_string()))?;

    // The header's `alg` must agree with what the key can actually do. Without
    // this a token could claim ES256 against an RSA key (or the reverse) and
    // steer verification somewhere the provider never intended.
    let family_matches = match &jwk.algorithm {
        AlgorithmParameters::RSA(_) => matches!(
            header.alg,
            Algorithm::RS256
                | Algorithm::RS384
                | Algorithm::RS512
                | Algorithm::PS256
                | Algorithm::PS384
                | Algorithm::PS512
        ),
        AlgorithmParameters::EllipticCurve(_) => {
            matches!(header.alg, Algorithm::ES256 | Algorithm::ES384)
        }
        // Symmetric and Ed25519 keys are not accepted: the first is the
        // confusion attack, the second is not used by these providers.
        _ => false,
    };
    if !family_matches {
        return Err(OidcError::AlgorithmNotAccepted(header.alg));
    }

    let key = DecodingKey::from_jwk(jwk)
        .map_err(|e| OidcError::UnusableKey(kid.to_string(), e.to_string()))?;
    Ok((key, header.alg))
}

/// Turn verified claims into an identity.
///
/// `email_verified: false` drops the address rather than the whole login. The
/// email is not part of the identity (see [`ProviderIdentity`]), so an unverified
/// one is merely unusable for display — refusing the login over it would lock out
/// people whose provider simply does not assert the field.
fn identity_from_claims(
    claims: IdTokenClaims,
    expected_issuer: &str,
) -> Result<ProviderIdentity, OidcError> {
    // Belt and braces: `Validation` already enforces this, but the issuer decides
    // which key signed the token, so a mismatch here would mean a bug upstream
    // had crossed providers.
    if claims.iss != expected_issuer {
        return Err(OidcError::Invalid(format!(
            "issuer {} does not match the configured {expected_issuer}",
            claims.iss
        )));
    }
    if claims.sub.is_empty() {
        return Err(OidcError::MissingSubject);
    }
    Ok(ProviderIdentity {
        issuer: claims.iss,
        subject: claims.sub,
        email: match claims.email_verified {
            Some(false) => None,
            _ => claims.email,
        },
    })
}

/// Verify a token against an already-known key set.
///
/// The network-free half of verification, so the whole policy is testable.
pub fn verify_with_jwks(
    token: &str,
    provider: &ProviderConfig,
    jwks: &JwkSet,
) -> Result<ProviderIdentity, OidcError> {
    let header = decode_header(token).map_err(|e| OidcError::MalformedHeader(e.to_string()))?;
    let (key, alg) = select_key(&header, jwks)?;

    let mut validation = Validation::new(alg);
    // Exactly one algorithm — the one the chosen key supports. Passing the whole
    // allowlist here would let a token pick any of them.
    validation.algorithms = vec![alg];
    validation.set_issuer(&[provider.issuer.as_str()]);
    validation.set_audience(&[provider.audience.as_str()]);
    validation.validate_exp = true;
    validation.leeway = LEEWAY_SECS;

    let data = decode::<IdTokenClaims>(token, &key, &validation)
        .map_err(|e| OidcError::Invalid(e.to_string()))?;
    identity_from_claims(data.claims, &provider.issuer)
}

/// A JWKS cache for one provider.
struct CachedJwks {
    jwks: Option<JwkSet>,
    fetched_at: Option<Instant>,
    last_attempt: Option<Instant>,
}

/// Verifies tokens for the configured providers, caching their key sets.
pub struct OidcVerifier {
    providers: Vec<ProviderConfig>,
    caches: Vec<Arc<Mutex<CachedJwks>>>,
    http: reqwest::Client,
}

impl OidcVerifier {
    /// Build a verifier over the configured providers.
    pub fn new(providers: Vec<ProviderConfig>) -> Self {
        let caches = providers
            .iter()
            .map(|_| {
                Arc::new(Mutex::new(CachedJwks {
                    jwks: None,
                    fetched_at: None,
                    last_attempt: None,
                }))
            })
            .collect();
        Self {
            providers,
            caches,
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap_or_default(),
        }
    }

    /// Providers offered to the login UI.
    pub fn providers(&self) -> &[ProviderConfig] {
        &self.providers
    }

    /// True when no provider is configured, so callers can 404 the endpoints
    /// rather than advertise a login that cannot work.
    pub fn is_empty(&self) -> bool {
        self.providers.is_empty()
    }

    /// Verify a token, discovering which configured provider issued it.
    ///
    /// The issuer is read from the token *before* verification only to choose a
    /// key set; it is then checked as a claim, so an attacker naming someone
    /// else's issuer just gets their token verified against the wrong keys and
    /// fails.
    pub async fn verify(&self, token: &str) -> Result<ProviderIdentity, OidcError> {
        let claimed_issuer = unverified_issuer(token)?;
        let index = self
            .providers
            .iter()
            .position(|provider| provider.issuer == claimed_issuer)
            .ok_or_else(|| OidcError::UnknownIssuer(claimed_issuer.clone()))?;
        let provider = &self.providers[index];
        let cache = Arc::clone(&self.caches[index]);

        let jwks = self.jwks_for(provider, &cache, false).await?;
        match verify_with_jwks(token, provider, &jwks) {
            // An unknown key id is the signal that the provider rotated. Refetch
            // once and retry; anything else is a real rejection.
            Err(OidcError::UnknownKeyId(_)) => {
                let refreshed = self.jwks_for(provider, &cache, true).await?;
                verify_with_jwks(token, provider, &refreshed)
            }
            other => other,
        }
    }

    async fn jwks_for(
        &self,
        provider: &ProviderConfig,
        cache: &Arc<Mutex<CachedJwks>>,
        force: bool,
    ) -> Result<JwkSet, OidcError> {
        let mut guard = cache.lock().await;

        let fresh = guard.fetched_at.is_some_and(|at| at.elapsed() < JWKS_TTL);
        if let Some(jwks) = &guard.jwks {
            if fresh && !force {
                return Ok(jwks.clone());
            }
            // Rate-limit forced refetches so a stream of bogus `kid`s cannot turn
            // this relay into a load generator against the provider.
            if force
                && guard
                    .last_attempt
                    .is_some_and(|at| at.elapsed() < JWKS_MIN_REFETCH)
            {
                return Ok(jwks.clone());
            }
        }

        guard.last_attempt = Some(Instant::now());
        let fetched = self
            .http
            .get(&provider.jwks_uri)
            .send()
            .await
            .map_err(|e| OidcError::JwksUnavailable(e.to_string()))?
            .error_for_status()
            .map_err(|e| OidcError::JwksUnavailable(e.to_string()))?
            .json::<JwkSet>()
            .await
            .map_err(|e| OidcError::JwksUnavailable(e.to_string()))?;

        guard.jwks = Some(fetched.clone());
        guard.fetched_at = Some(Instant::now());
        Ok(fetched)
    }
}

/// Read `iss` from a token without verifying it.
///
/// Used only to pick which provider's keys to try. The value is verified as a
/// claim afterwards, so it is a routing hint and never an authorisation input.
fn unverified_issuer(token: &str) -> Result<String, OidcError> {
    let payload = token
        .split('.')
        .nth(1)
        .ok_or_else(|| OidcError::MalformedHeader("token is not a JWT".into()))?;
    let bytes = base64_url_decode(payload)
        .ok_or_else(|| OidcError::MalformedHeader("payload is not base64url".into()))?;
    let value: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|e| OidcError::MalformedHeader(format!("payload is not JSON: {e}")))?;
    value
        .get("iss")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| OidcError::MalformedHeader("payload has no iss".into()))
}

fn base64_url_decode(input: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(input)
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claims(sub: &str, email_verified: Option<bool>) -> IdTokenClaims {
        IdTokenClaims {
            iss: "https://accounts.google.com".into(),
            sub: sub.into(),
            email: Some("someone@example.com".into()),
            email_verified,
        }
    }

    #[test]
    fn an_unverified_email_is_dropped_but_the_login_stands() {
        // Email is not part of the identity, so an unverified one is only
        // unusable for display. Refusing the login would lock out people whose
        // provider does not assert the field.
        let identity =
            identity_from_claims(claims("sub-1", Some(false)), "https://accounts.google.com")
                .unwrap();
        assert_eq!(identity.subject, "sub-1");
        assert_eq!(identity.email, None);
    }

    #[test]
    fn an_absent_email_verified_claim_keeps_the_email() {
        let identity =
            identity_from_claims(claims("sub-1", None), "https://accounts.google.com").unwrap();
        assert_eq!(identity.email.as_deref(), Some("someone@example.com"));
    }

    #[test]
    fn a_crossed_issuer_is_refused_even_after_signature_checks() {
        // Reaching this means a bug upstream verified a token against the wrong
        // provider's keys; failing closed keeps that from minting an identity.
        assert!(matches!(
            identity_from_claims(claims("sub-1", None), "https://login.microsoftonline.com"),
            Err(OidcError::Invalid(_))
        ));
    }

    #[test]
    fn a_token_with_no_subject_mints_nothing() {
        assert!(matches!(
            identity_from_claims(claims("", None), "https://accounts.google.com"),
            Err(OidcError::MissingSubject)
        ));
    }

    #[test]
    fn no_symmetric_algorithm_is_accepted() {
        // The public-key-as-HMAC-secret confusion attack. If any HS variant ever
        // appears in the allowlist, a token re-signed with the provider's public
        // key verifies and anyone can mint any identity.
        for symmetric in [Algorithm::HS256, Algorithm::HS384, Algorithm::HS512] {
            assert!(
                !ACCEPTED_ALGORITHMS.contains(&symmetric),
                "{symmetric:?} must never be accepted on an id_token"
            );
        }
    }

    #[test]
    fn the_issuer_hint_is_read_without_verification() {
        // Routing only. The value is re-checked as a claim after the signature.
        let payload = base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            br#"{"iss":"https://example.test","sub":"x"}"#,
        );
        let token = format!("header.{payload}.signature");
        assert_eq!(unverified_issuer(&token).unwrap(), "https://example.test");
    }

    #[test]
    fn a_payload_without_an_issuer_cannot_be_routed() {
        let payload = base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            br#"{"sub":"x"}"#,
        );
        assert!(matches!(
            unverified_issuer(&format!("header.{payload}.sig")),
            Err(OidcError::MalformedHeader(_))
        ));
    }

    #[test]
    fn garbage_is_not_a_token() {
        for broken in ["", "not-a-jwt", "only.two"] {
            assert!(unverified_issuer(broken).is_err(), "{broken:?}");
        }
    }
}
