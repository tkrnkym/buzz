//! Accept the pre-rename `BUZZ_*` environment variables.
//!
//! Configuration lives outside the repository — in Kubernetes manifests, CI
//! secrets, and developers' `.env` files — so renaming the variables in code
//! would take a running deployment down at the next rollout, and the failure
//! would look like a config bug rather than a rename.
//!
//! [`promote_legacy_env`] runs before anything reads configuration and copies
//! each `BUZZ_*` variable to its `NUXX_*` name when the new name is unset. That
//! keeps every read site on the new name only, instead of teaching 128 call
//! sites about two spellings.
//!
//! The new name always wins, so a deployment can migrate one variable at a time
//! and never has to remove the old one in the same change.

/// Prefix of the pre-rename variables.
const LEGACY_PREFIX: &str = "BUZZ_";
/// Prefix they are promoted to.
const CURRENT_PREFIX: &str = "NUXX_";

/// Copy `BUZZ_*` variables to `NUXX_*` where the latter is absent.
///
/// Returns the legacy names that were used, so a caller can warn once with a
/// concrete list rather than logging per variable at every read.
///
/// Call this first in `main`, before argument parsing: `clap`'s `env`
/// attributes read the environment during parsing, not before it.
pub fn promote_legacy_env() -> Vec<String> {
    let legacy: Vec<(String, String)> = std::env::vars()
        .filter(|(name, _)| name.starts_with(LEGACY_PREFIX))
        .collect();

    let mut promoted = Vec::new();
    for (name, value) in legacy {
        let current = format!("{CURRENT_PREFIX}{}", &name[LEGACY_PREFIX.len()..]);
        // Present-but-empty counts as set: a deployment may blank a variable
        // deliberately, and resurrecting the old value would defeat that.
        if std::env::var_os(&current).is_some() {
            continue;
        }
        std::env::set_var(&current, &value);
        promoted.push(name);
    }
    promoted.sort();
    promoted
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Serialised: these tests mutate process-wide environment.
    static GUARD: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn clear(names: &[&str]) {
        for n in names {
            std::env::remove_var(n);
        }
    }

    #[test]
    fn a_legacy_variable_is_promoted() {
        let _g = GUARD.lock().unwrap();
        clear(&["BUZZ_COMPAT_ONE", "NUXX_COMPAT_ONE"]);
        std::env::set_var("BUZZ_COMPAT_ONE", "value");

        let promoted = promote_legacy_env();

        assert_eq!(std::env::var("NUXX_COMPAT_ONE").unwrap(), "value");
        assert!(promoted.iter().any(|n| n == "BUZZ_COMPAT_ONE"));
        clear(&["BUZZ_COMPAT_ONE", "NUXX_COMPAT_ONE"]);
    }

    #[test]
    fn the_new_name_wins() {
        // Otherwise a half-migrated deployment would silently keep running on
        // the value it thought it had replaced.
        let _g = GUARD.lock().unwrap();
        clear(&["BUZZ_COMPAT_TWO", "NUXX_COMPAT_TWO"]);
        std::env::set_var("BUZZ_COMPAT_TWO", "old");
        std::env::set_var("NUXX_COMPAT_TWO", "new");

        promote_legacy_env();

        assert_eq!(std::env::var("NUXX_COMPAT_TWO").unwrap(), "new");
        clear(&["BUZZ_COMPAT_TWO", "NUXX_COMPAT_TWO"]);
    }

    #[test]
    fn a_deliberately_blanked_variable_is_not_resurrected() {
        let _g = GUARD.lock().unwrap();
        clear(&["BUZZ_COMPAT_THREE", "NUXX_COMPAT_THREE"]);
        std::env::set_var("BUZZ_COMPAT_THREE", "old");
        std::env::set_var("NUXX_COMPAT_THREE", "");

        promote_legacy_env();

        assert_eq!(std::env::var("NUXX_COMPAT_THREE").unwrap(), "");
        clear(&["BUZZ_COMPAT_THREE", "NUXX_COMPAT_THREE"]);
    }

    #[test]
    fn unrelated_variables_are_left_alone() {
        let _g = GUARD.lock().unwrap();
        clear(&["UNRELATED_COMPAT", "NUXX_UNRELATED_COMPAT"]);
        std::env::set_var("UNRELATED_COMPAT", "x");

        promote_legacy_env();

        assert!(std::env::var_os("NUXX_UNRELATED_COMPAT").is_none());
        clear(&["UNRELATED_COMPAT"]);
    }
}
