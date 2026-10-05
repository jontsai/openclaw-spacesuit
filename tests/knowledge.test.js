const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { runKnowledge } = require("../lib/knowledge");
function workspace(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "memory/decisions"), { recursive: true });
  fs.mkdirSync(path.join(root, "cerebro/topics/reliability/threads"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, "memory/decisions/one.md"),
    "# Rollout decision\nUse a staged rollout.",
  );
  fs.writeFileSync(
    path.join(root, "cerebro/topics/reliability/topic.md"),
    "---\ntitle: Reliability\n---\n# Reliability\nMeasure failure rates.",
  );
  fs.writeFileSync(
    path.join(root, "cerebro/topics/reliability/threads/one.md"),
    "# Discussion\nCheck sources.",
  );
  return root;
}
test("preview reads explicit roots with stable hierarchy and does not write", (t) => {
  const root = workspace(t),
    out = runKnowledge(["preview", "--workspace", root]);
  assert.equal(fs.existsSync(path.join(root, "state")), false);
  const docs = out.sources[1].documents;
  const topic = docs.find((d) => d.kind === "topic");
  assert.equal(topic.title, "Reliability");
  const folder = docs.find((d) => d.title === "threads");
  assert.equal(folder.parentId, topic.id);
  assert.deepEqual(
    out.sources.map((s) => s.status),
    ["ready", "ready"],
  );
});
test("collect writes one private snapshot, rejects another profile", (t) => {
  const root = workspace(t);
  runKnowledge(["collect", "--workspace", root]);
  assert.equal(
    fs.statSync(path.join(root, "state/command-center/knowledge.json")).mode &
      0o777,
    0o600,
  );
  assert.throws(() =>
    runKnowledge(["collect", "--workspace", root, "--profile", "other"]),
  );
});
test("symlinks and FIFOs are skipped, oversized sources are partial, previews capped", (t) => {
  const root = workspace(t);
  fs.symlinkSync("/outside", path.join(root, "memory/link"));
  execFileSync("mkfifo", [path.join(root, "memory/pipe.md")]);
  fs.writeFileSync(path.join(root, "memory/large.md"), "x".repeat(70000));
  fs.writeFileSync(path.join(root, "memory/excerpt.md"), "y".repeat(14000));
  const out = runKnowledge(["preview", "--workspace", root]);
  assert.equal(out.sources[0].status, "partial");
  const excerpt = out.sources[0].documents.find((d) =>
    d.sourceRef.endsWith("excerpt.md"),
  );
  assert.equal(excerpt.excerpt.length, 12000);
  assert.equal(excerpt.truncated, true);
  assert.equal(
    out.sources[0].documents.some((d) => /link|pipe|large/.test(d.sourceRef)),
    false,
  );
});
test("credential-shaped content is redacted and absent adapters are unavailable", (t) => {
  const root = workspace(t);
  fs.writeFileSync(
    path.join(root, "memory/test.md"),
    "Authorization: Bearer synthetic-secret-token",
  );
  const out = runKnowledge(["preview", "--workspace", root]);
  assert.equal(JSON.stringify(out).includes("synthetic-secret-token"), false);
  const empty = fs.mkdtempSync(path.join(root, "empty-"));
  assert.deepEqual(
    runKnowledge(["preview", "--workspace", empty]).sources.map(
      (s) => s.status,
    ),
    ["unavailable", "unavailable"],
  );
});
