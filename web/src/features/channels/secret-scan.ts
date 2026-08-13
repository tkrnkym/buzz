/**
 * The check that runs before anything becomes public.
 *
 * Two tiers, and the split is the whole design. A thing that is *definitely* a
 * secret — an API key, a private key, a bearer token — has no legitimate reason
 * to be published, so finding one stops the operation outright; there is no
 * "publish anyway" for it. A thing that is *contextually* sensitive — an email
 * address, a customer's name, a contract reference — cannot be judged by a
 * pattern, so it warns and a maintainer decides.
 *
 * Getting that backwards in either direction is the failure: blocking on every
 * email address trains people to click through, and warning on a live API key
 * means it gets published by someone in a hurry.
 *
 * Everything here runs locally on purpose. The content being checked is exactly
 * the content that must not be handed to a third party, so sending it to a
 * model to be classified would be the leak this is meant to prevent.
 */

export type FindingSeverity = "blocking" | "warning";

export interface SecretFinding {
  id: string;
  severity: FindingSeverity;
  /** What was found, named in the reader's terms rather than by pattern. */
  kind: string;
  /** Which message or file it was found in. */
  where: string;
  /** A redacted sample. Never carries the secret — see `redact`. */
  excerpt: string;
}

interface Rule {
  kind: string;
  severity: FindingSeverity;
  pattern: RegExp;
}

/**
 * Rules, definite first.
 *
 * A definite rule matches a shape that is only ever produced by a credential:
 * a vendor's key prefix, a PEM header, a JWT. That specificity is what makes it
 * safe to hard-stop on, and why none of these is a bare "long random string".
 */
const RULES: Rule[] = [
  {
    kind: "秘密鍵",
    severity: "blocking",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    // Nostr's own secret key. First in the product's own terms because this is
    // the one a Nuxx channel is most likely to contain.
    kind: "Nostr 秘密鍵 (nsec)",
    severity: "blocking",
    pattern: /\bnsec1[02-9ac-hj-np-z]{20,}/g,
  },
  {
    kind: "Anthropic API キー",
    severity: "blocking",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}/g,
  },
  {
    kind: "API キー",
    severity: "blocking",
    pattern: /\bsk-[A-Za-z0-9]{20,}/g,
  },
  {
    kind: "AWS アクセスキー",
    severity: "blocking",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    kind: "GitHub トークン",
    severity: "blocking",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  },
  {
    kind: "GitHub Personal Access Token",
    severity: "blocking",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  },
  {
    kind: "認証トークン",
    severity: "blocking",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g,
  },
  {
    kind: "JWT",
    severity: "blocking",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  // Contextual from here down. Each of these is ordinary content most of the
  // time, which is precisely why none of them can stop a publication.
  {
    kind: "メールアドレス",
    severity: "warning",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    kind: "電話番号",
    severity: "warning",
    pattern: /\b0\d{1,4}-\d{1,4}-\d{3,4}\b/g,
  },
  {
    kind: "顧客名らしき記載",
    severity: "warning",
    pattern: /[\p{Script=Han}\p{Script=Katakana}A-Za-z]{2,}\s*(?:様|御中)/gu,
  },
  {
    kind: "契約・請求に関する記載",
    severity: "warning",
    pattern: /(?:契約(?:書|金額|期間)|見積(?:書|金額)|請求先|発注書)/g,
  },
];

/**
 * A sample that identifies the match without reproducing it.
 *
 * At most the first four characters survive; everything after is masked to a
 * fixed width, so the length of the original does not leak either. A finding is
 * rendered on screen and may end up in a screenshot or a support thread — a
 * scanner that echoed the key it found would be a second copy of the leak.
 */
export function redact(match: string): string {
  return `${match.slice(0, 4)}${"●".repeat(8)}`;
}

export interface ScanTarget {
  /** Message id, file name — whatever names the place for a reader. */
  where: string;
  text: string;
}

/**
 * Scan the things that would become public.
 *
 * Ordered blocking-first so the list a reader sees leads with what actually
 * stops them, rather than with whichever message happened to be oldest.
 */
export function scanForSecrets(targets: ScanTarget[]): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const target of targets) {
    for (const rule of RULES) {
      // `matchAll` on a fresh regex each time: a `g` flag carries `lastIndex`
      // between calls, and a shared one silently skips every other match.
      const matches = target.text.matchAll(
        new RegExp(rule.pattern.source, rule.pattern.flags),
      );
      for (const match of matches) {
        findings.push({
          id: `${target.where}:${rule.kind}:${match.index ?? 0}`,
          severity: rule.severity,
          kind: rule.kind,
          where: target.where,
          excerpt: redact(match[0]),
        });
      }
    }
  }
  return findings.sort(
    (left, right) =>
      Number(right.severity === "blocking") -
      Number(left.severity === "blocking"),
  );
}

export type PublishDecision = "blocked" | "needs-confirmation" | "clear";

/**
 * Whether the publication may proceed.
 *
 * `blocked` is not a strong warning — it is a refusal, and the UI must not
 * offer a way past it. That is the difference the two tiers exist to carry.
 */
export function publishDecision(findings: SecretFinding[]): PublishDecision {
  if (findings.some((finding) => finding.severity === "blocking")) {
    return "blocked";
  }
  return findings.length > 0 ? "needs-confirmation" : "clear";
}
