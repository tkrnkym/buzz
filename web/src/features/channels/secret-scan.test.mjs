import assert from "node:assert/strict";
import test from "node:test";

import {
  publishDecision,
  redact,
  scanForSecrets,
} from "@/features/channels/secret-scan";

const target = (text, where = "msg-1") => [{ where, text }];

// Shaped like the real thing but not a real credential.
const ANTHROPIC_KEY = "sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFF";
const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
const GITHUB_TOKEN = "ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH";
const NSEC = "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5";
const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";

test("a definite credential blocks publication outright", () => {
  for (const secret of [ANTHROPIC_KEY, AWS_KEY, GITHUB_TOKEN, NSEC, JWT]) {
    const findings = scanForSecrets(target(`key: ${secret}`));
    assert.ok(findings.length > 0, `${secret.slice(0, 8)} was not detected`);
    assert.equal(findings[0].severity, "blocking");
    assert.equal(publishDecision(findings), "blocked");
  }
});

test("a PEM private key blocks", () => {
  const findings = scanForSecrets(
    target("-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n"),
  );
  assert.equal(publishDecision(findings), "blocked");
});

test("contextual matches warn instead of blocking", () => {
  for (const text of [
    "連絡先は taro@example.com です",
    "電話 03-1234-5678 まで",
    "山田様にご確認ください",
    "契約金額は別紙のとおり",
  ]) {
    const findings = scanForSecrets(target(text));
    assert.ok(findings.length > 0, `not detected: ${text}`);
    assert.ok(
      findings.every((finding) => finding.severity === "warning"),
      `${text} should only warn`,
    );
    // A maintainer decides on these — they must not hard-stop.
    assert.equal(publishDecision(findings), "needs-confirmation");
  }
});

test("ordinary content is clear", () => {
  const findings = scanForSecrets(
    target("金曜にリリースします。手順は README を見てください。"),
  );
  assert.deepEqual(findings, []);
  assert.equal(publishDecision(findings), "clear");
});

test("a finding never reproduces the secret it found", () => {
  // The whole point: a finding is rendered on screen and may be screenshotted.
  // If it carried the key, the scanner would be a second copy of the leak.
  for (const secret of [ANTHROPIC_KEY, AWS_KEY, GITHUB_TOKEN, NSEC, JWT]) {
    const findings = scanForSecrets(target(`token=${secret}`));
    for (const finding of findings) {
      const serialized = JSON.stringify(finding);
      assert.ok(
        !serialized.includes(secret),
        `${finding.kind} leaked the full secret`,
      );
      // Not even most of it — four characters is the cap.
      assert.ok(
        !serialized.includes(secret.slice(0, 12)),
        `${finding.kind} leaked too much of the secret`,
      );
    }
  }
});

test("redaction does not leak the original length", () => {
  const short = redact("sk-abcd");
  const long = redact(`sk-${"x".repeat(200)}`);
  assert.equal(short.length, long.length);
});

test("a blocking finding outranks warnings whatever order they were found in", () => {
  const findings = scanForSecrets(
    target(`連絡先 taro@example.com と key ${ANTHROPIC_KEY}`),
  );
  assert.equal(findings[0].severity, "blocking");
  // And one blocking finding is enough, however many warnings accompany it.
  assert.equal(publishDecision(findings), "blocked");
});

test("every occurrence is reported, not just the first", () => {
  const findings = scanForSecrets(
    target("a@example.com と b@example.com と c@example.com"),
  );
  const emails = findings.filter((f) => f.kind === "メールアドレス");
  // A `g` regex reused across calls keeps `lastIndex` and skips every other
  // match, which is how a scan quietly misses half of what is there.
  assert.equal(emails.length, 3);
});

test("findings say where they are, so a maintainer can go and look", () => {
  const findings = scanForSecrets([
    { where: "msg-42", text: `key ${AWS_KEY}` },
    { where: "notes.md", text: "山田様" },
  ]);
  assert.deepEqual([...new Set(findings.map((f) => f.where))].sort(), [
    "msg-42",
    "notes.md",
  ]);
});

test("two of the same kind in one place stay distinct", () => {
  const findings = scanForSecrets(target("a@example.com b@example.com"));
  const ids = findings.map((finding) => finding.id);
  assert.equal(new Set(ids).size, ids.length);
});
