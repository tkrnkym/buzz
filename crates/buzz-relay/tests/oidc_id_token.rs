//! End-to-end `id_token` verification against a real signature.
//!
//! The unit tests in `identity::oidc` cover the policy decisions without crypto.
//! This exercises the whole path — header, key selection, signature, claims —
//! against a locally-generated ES256 key, so a regression in the glue between
//! those pieces cannot pass unnoticed.
//!
//! The key in `tests/fixtures/` is a throwaway generated for this test alone. It
//! signs nothing outside this file.

use std::time::{SystemTime, UNIX_EPOCH};

use buzz_relay::identity::oidc::{verify_with_jwks, ProviderConfig};
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde_json::json;

const KID: &str = "test-key-1";
const ISSUER: &str = "https://issuer.test";
const AUDIENCE: &str = "buzz-client-id";

/// The public half of the fixture key, as a provider would publish it.
const JWK_X: &str = "8pfES1hwxW4aOZOZcUAVOI-q8adXcY2rIFO6Y3d8arA";
const JWK_Y: &str = "TpqtKaPvW9nbpK0ToFWtUTk9X4Q52qZgR4kVwTJjT1o";

fn jwks() -> JwkSet {
    serde_json::from_value(json!({
        "keys": [{
            "kty": "EC",
            "crv": "P-256",
            "kid": KID,
            "use": "sig",
            "alg": "ES256",
            "x": JWK_X,
            "y": JWK_Y,
        }]
    }))
    .expect("fixture JWKS parses")
}

fn provider() -> ProviderConfig {
    ProviderConfig {
        issuer: ISSUER.into(),
        audience: AUDIENCE.into(),
        jwks_uri: "https://issuer.test/jwks".into(),
        label: "Test".into(),
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock is after the epoch")
        .as_secs()
}

fn signing_key() -> EncodingKey {
    EncodingKey::from_ec_pem(include_bytes!("fixtures/oidc-test-es256.pk8.pem"))
        .expect("fixture key parses")
}

/// Mint a token, letting each test bend one field.
fn mint(overrides: serde_json::Value, kid: Option<&str>) -> String {
    let mut claims = json!({
        "iss": ISSUER,
        "aud": AUDIENCE,
        "sub": "subject-123",
        "email": "person@example.test",
        "email_verified": true,
        "iat": now(),
        "exp": now() + 300,
    });
    for (key, value) in overrides.as_object().cloned().unwrap_or_default() {
        if value.is_null() {
            claims.as_object_mut().unwrap().remove(&key);
        } else {
            claims[key] = value;
        }
    }

    let mut header = Header::new(Algorithm::ES256);
    header.kid = kid.map(str::to_string);
    encode(&header, &claims, &signing_key()).expect("token encodes")
}

#[test]
fn a_valid_token_yields_the_provider_identity() {
    let identity = verify_with_jwks(&mint(json!({}), Some(KID)), &provider(), &jwks())
        .expect("a well-formed token from the configured provider verifies");

    assert_eq!(identity.issuer, ISSUER);
    assert_eq!(identity.subject, "subject-123");
    assert_eq!(identity.email.as_deref(), Some("person@example.test"));
}

#[test]
fn a_token_for_another_application_is_refused() {
    // The attack this stops: the same provider mints valid tokens for every app
    // it serves. Without an audience check, any of them would authenticate here.
    let token = mint(json!({ "aud": "some-other-app" }), Some(KID));
    assert!(
        verify_with_jwks(&token, &provider(), &jwks()).is_err(),
        "a token minted for a different audience must not authenticate"
    );
}

#[test]
fn a_token_from_another_issuer_is_refused() {
    let token = mint(json!({ "iss": "https://evil.test" }), Some(KID));
    assert!(verify_with_jwks(&token, &provider(), &jwks()).is_err());
}

#[test]
fn an_expired_token_is_refused() {
    let token = mint(
        json!({ "exp": now() - 3_600, "iat": now() - 7_200 }),
        Some(KID),
    );
    assert!(verify_with_jwks(&token, &provider(), &jwks()).is_err());
}

#[test]
fn a_token_naming_an_unknown_key_is_refused() {
    // Also the signal the verifier uses to refetch a rotated JWKS, so it must be
    // distinguishable rather than a generic failure.
    let token = mint(json!({}), Some("rotated-away"));
    assert!(matches!(
        verify_with_jwks(&token, &provider(), &jwks()),
        Err(buzz_relay::identity::oidc::OidcError::UnknownKeyId(_))
    ));
}

#[test]
fn a_token_with_no_key_id_is_refused() {
    let token = mint(json!({}), None);
    assert!(matches!(
        verify_with_jwks(&token, &provider(), &jwks()),
        Err(buzz_relay::identity::oidc::OidcError::MissingKeyId)
    ));
}

#[test]
fn a_token_resigned_with_the_public_key_as_an_hmac_secret_is_refused() {
    // The classic JWT confusion attack, spelled out: take the provider's public
    // key, use it as an HMAC secret, and claim `alg: HS256`. A verifier that
    // selects its mode from the header validates this and hands over an identity.
    let claims = json!({
        "iss": ISSUER,
        "aud": AUDIENCE,
        "sub": "attacker",
        "iat": now(),
        "exp": now() + 300,
    });
    let mut header = Header::new(Algorithm::HS256);
    header.kid = Some(KID.into());
    let public_material = format!("{JWK_X}{JWK_Y}");
    let forged = encode(
        &header,
        &claims,
        &EncodingKey::from_secret(public_material.as_bytes()),
    )
    .expect("the forged token encodes");

    assert!(
        matches!(
            verify_with_jwks(&forged, &provider(), &jwks()),
            Err(buzz_relay::identity::oidc::OidcError::AlgorithmNotAccepted(
                _
            ))
        ),
        "an HMAC-signed id_token must be refused on the algorithm, before any key is used"
    );
}

#[test]
fn a_token_with_a_tampered_payload_is_refused() {
    let token = mint(json!({}), Some(KID));
    let mut parts: Vec<&str> = token.split('.').collect();
    let forged_payload = base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        serde_json::to_vec(&json!({
            "iss": ISSUER,
            "aud": AUDIENCE,
            "sub": "someone-else",
            "iat": now(),
            "exp": now() + 300,
        }))
        .unwrap(),
    );
    parts[1] = &forged_payload;
    let tampered = parts.join(".");

    assert!(
        verify_with_jwks(&tampered, &provider(), &jwks()).is_err(),
        "swapping the subject must invalidate the signature"
    );
}

#[test]
fn a_token_with_no_subject_is_refused() {
    let token = mint(json!({ "sub": null }), Some(KID));
    assert!(verify_with_jwks(&token, &provider(), &jwks()).is_err());
}
