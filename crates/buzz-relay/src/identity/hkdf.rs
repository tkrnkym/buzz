//! HKDF-SHA256 (RFC 5869).
//!
//! Written out here rather than pulled in as a dependency because the workspace
//! already has `hmac` and `sha2`, and HKDF is a short, fully-specified
//! construction. It is verified against the RFC's own test vectors below —
//! hand-rolled key derivation without those would not be worth trusting.

use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

const HASH_LEN: usize = 32;

/// HKDF-Extract: compress the input keying material into a pseudorandom key.
fn extract(salt: &[u8], ikm: &[u8]) -> [u8; HASH_LEN] {
    let mut mac = HmacSha256::new_from_slice(salt).expect("HMAC accepts any key size");
    mac.update(ikm);
    mac.finalize().into_bytes().into()
}

/// HKDF-Expand: stretch the pseudorandom key to `out.len()` bytes.
///
/// Returns an error only for the RFC's stated limit of 255 hash blocks, which
/// no caller here comes close to.
fn expand(prk: &[u8], info: &[u8], out: &mut [u8]) -> Result<(), &'static str> {
    let blocks = out.len().div_ceil(HASH_LEN);
    if blocks > 255 {
        return Err("HKDF output too long");
    }

    let mut previous: Vec<u8> = Vec::new();
    let mut written = 0;
    for block in 1..=blocks {
        let mut mac = HmacSha256::new_from_slice(prk).expect("HMAC accepts any key size");
        // T(n) = HMAC(PRK, T(n-1) || info || n) — T(0) is empty.
        mac.update(&previous);
        mac.update(info);
        mac.update(&[block as u8]);
        let block_bytes: [u8; HASH_LEN] = mac.finalize().into_bytes().into();

        let take = (out.len() - written).min(HASH_LEN);
        out[written..written + take].copy_from_slice(&block_bytes[..take]);
        written += take;
        previous = block_bytes.to_vec();
    }
    Ok(())
}

/// HKDF-SHA256, extract-then-expand.
pub fn derive(ikm: &[u8], salt: &[u8], info: &[u8], out: &mut [u8]) -> Result<(), &'static str> {
    let prk = extract(salt, ikm);
    expand(&prk, info, out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// RFC 5869 Appendix A.1 — basic case with SHA-256.
    #[test]
    fn rfc5869_case_1() {
        let ikm = [0x0b; 22];
        let salt: Vec<u8> = (0x00..=0x0c).collect();
        let info: Vec<u8> = (0xf0..=0xf9).collect();

        let prk = extract(&salt, &ikm);
        assert_eq!(
            hex::encode(prk),
            "077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5"
        );

        let mut okm = [0u8; 42];
        expand(&prk, &info, &mut okm).unwrap();
        assert_eq!(
            hex::encode(okm),
            "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"
        );
    }

    /// RFC 5869 Appendix A.2 — longer inputs and output.
    #[test]
    fn rfc5869_case_2() {
        let ikm: Vec<u8> = (0x00..=0x4f).collect();
        let salt: Vec<u8> = (0x60..=0xaf).collect();
        let info: Vec<u8> = (0xb0..=0xff).collect();

        let prk = extract(&salt, &ikm);
        assert_eq!(
            hex::encode(prk),
            "06a6b88c5853361a06104c9ceb35b45cef760014904671014a193f40c15fc244"
        );

        let mut okm = [0u8; 82];
        expand(&prk, &info, &mut okm).unwrap();
        assert_eq!(
            hex::encode(okm),
            "b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c\
             59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71\
             cc30c58179ec3e87c14c01d5c1f3434f1d87"
        );
    }

    /// RFC 5869 Appendix A.3 — empty salt and info.
    #[test]
    fn rfc5869_case_3() {
        let ikm = [0x0b; 22];

        let prk = extract(&[], &ikm);
        assert_eq!(
            hex::encode(prk),
            "19ef24a32c717b167f33a91d6f648bdf96596776afdb6377ac434c1c293ccb04"
        );

        let mut okm = [0u8; 42];
        expand(&prk, &[], &mut okm).unwrap();
        assert_eq!(
            hex::encode(okm),
            "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8"
        );
    }

    #[test]
    fn different_info_gives_different_output() {
        // The property the caller depends on: two subjects under one master key
        // must not derive the same secret.
        let mut first = [0u8; 32];
        let mut second = [0u8; 32];
        derive(b"master", b"salt", b"alice", &mut first).unwrap();
        derive(b"master", b"salt", b"bob", &mut second).unwrap();
        assert_ne!(first, second);
    }

    #[test]
    fn different_salt_gives_different_output() {
        // Two communities must not derive the same secret for the same subject.
        let mut first = [0u8; 32];
        let mut second = [0u8; 32];
        derive(b"master", b"community-a", b"alice", &mut first).unwrap();
        derive(b"master", b"community-b", b"alice", &mut second).unwrap();
        assert_ne!(first, second);
    }

    #[test]
    fn output_longer_than_255_blocks_is_refused() {
        let mut out = vec![0u8; 256 * 32];
        assert!(derive(b"master", b"salt", b"info", &mut out).is_err());
    }
}
