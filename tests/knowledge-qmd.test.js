const test = require("node:test");
const assert = require("node:assert/strict");
const { collectQmd, validateQmd, safeRef } = require("../lib/knowledge-qmd");
const { runKnowledge } = require("../lib/knowledge");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const config = {
  schemaVersion: 1,
  profile: "",
  agentId: "main",
  index: "index",
  collections: ["notes"],
};
const now = "2026-01-01T00:00:00.000Z";
const row = (file = "qmd://notes/plans/one.md", body = "# Next step") => ({
  file,
  title: "Plan",
  body,
});
const listed = "1 KB  Jan 01 10:00  qmd://notes/plans/one.md\n";
test("explicit config binds profile/agent/index/unique collections", () => {
  assert.equal(validateQmd(config, config), config);
  for (const patch of [
    { profile: "other" },
    { agentId: "other" },
    { index: "../outside" },
    { collections: ["notes,private"] },
    { collections: ["notes", "notes"] },
    { collections: [] },
    { collections: ["a", "b", "c"] },
  ]) {
    assert.throws(() => validateQmd({ ...config, ...patch }, config));
  }
});
test("collection browse uses exact scoped arguments; creates stable folders and unknown timestamps", () => {
  const calls = [];
  const [out] = collectQmd(config, now, (args, timeout) => {
    calls.push(args);
    assert.ok(timeout > 0 && timeout <= 10000);
    return args[0] === "ls" ? listed : JSON.stringify([row(), row()]);
  });
  assert.deepEqual(calls[0], ["ls", "notes"]);
  assert.equal(
    calls[1][1],
    "qmd://notes/plans/one.md,qmd://notes/plans/one.md",
  );
  assert.equal(out.status, "ready");
  assert.equal(out.indexUpdatedAt, null);
  assert.equal(out.documents.length, 2);
  assert.equal(out.documents[1].parentId, out.documents[0].id);
  assert.equal(out.documents[1].updatedAt, null);
  assert.equal(out.documents[1].sourceRef, row().file);
});
test("rejects traversal, glob/list controls, hidden files and another collection", () => {
  for (const file of [
    "qmd://other/one.md",
    "qmd://notes/../one.md",
    "qmd://notes/.private/a.md",
    "qmd://notes/a,b.md",
    "qmd://notes/*.md",
    "qmd://notes/a\nb.md",
    "qmd://notes/a\\b.md",
  ])
    assert.equal(safeRef(file, "notes"), false);
  const [out] = collectQmd(config, now, (args) =>
    args[0] === "ls"
      ? listed
      : JSON.stringify([row("qmd://other/plans/one.md")]),
  );
  assert.equal(out.status, "error");
  assert.equal(out.documents.length, 0);
});
test("missing, skipped, invalid and capped documents are partial, with no invented freshness", () => {
  for (const rows of [[], [{ file: row().file, skipped: true }]]) {
    const [out] = collectQmd(config, now, (args) =>
      args[0] === "ls" ? listed : JSON.stringify(rows),
    );
    assert.equal(out.status, "partial");
    assert.equal(out.documents.length, 0);
  }
  const listing = Array.from(
    { length: 30 },
    (_, i) => `1 KB Jan 01 10:00 qmd://notes/${i}.md`,
  ).join("\n");
  const [out] = collectQmd(config, now, (args) =>
    args[0] === "ls"
      ? listing
      : JSON.stringify(args[1].split(",").map((f) => row(f, "x".repeat(5000)))),
  );
  assert.equal(out.status, "partial");
  assert.ok(Buffer.byteLength(JSON.stringify(out.documents)) < 46000);
  assert.ok(out.documents.every((d) => d.truncated));
});
test("source errors and output overflow remain isolated; excerpts redact secrets", () => {
  const out = collectQmd(
    { ...config, collections: ["bad", "notes"] },
    now,
    (args) => {
      if (args[1] === "bad") throw new Error("private diagnostic");
      return args[0] === "ls"
        ? listed
        : JSON.stringify([
            row(undefined, "Authorization: Bearer synthetic-private-token"),
          ]);
    },
  );
  assert.deepEqual(
    out.map((s) => s.status),
    ["error", "ready"],
  );
  assert.equal(JSON.stringify(out).includes("synthetic-private-token"), false);
  const [big] = collectQmd(config, now, () => "x".repeat(262145));
  assert.equal(big.status, "error");
});
test("unsupported CLI output fails visibly; an explicitly empty collection stays empty", () => {
  assert.equal(
    collectQmd(config, now, () => "unexpected format")[0].status,
    "partial",
  );
  const out = collectQmd(
    config,
    now,
    () => "No files found in collection: notes\n",
  )[0];
  assert.equal(out.status, "ready");
  assert.deepEqual(out.documents, []);
});
test("missing/foreign/symlink configs fail before writing; no QMD access without opt-in", (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "qmd-test-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(
    runKnowledge(["preview", "--workspace", root]).sources.length,
    2,
  );
  assert.throws(() =>
    runKnowledge([
      "collect",
      "--workspace",
      root,
      "--qmd-config",
      "missing.json",
    ]),
  );
  fs.writeFileSync(
    path.join(root, "config.json"),
    JSON.stringify({ ...config, profile: "other" }),
  );
  assert.throws(() =>
    runKnowledge([
      "collect",
      "--workspace",
      root,
      "--qmd-config",
      "config.json",
    ]),
  );
  fs.symlinkSync("config.json", path.join(root, "link.json"));
  assert.throws(() =>
    runKnowledge(["collect", "--workspace", root, "--qmd-config", "link.json"]),
  );
  assert.equal(fs.existsSync(path.join(root, "state")), false);
});
test("native runner bounds stdout, withholds unrelated env, and never creates a missing index", (t) => {
  const { execFileSync } = require("node:child_process");
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "qmd-runner-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = path.join(root, "cache");
  fs.mkdirSync(path.join(cache, "qmd"), { recursive: true });
  const index = path.join(cache, "qmd/index.sqlite");
  const env = {
    ...process.env,
    PATH: `${root}:${process.env.PATH}`,
    XDG_CACHE_HOME: cache,
    TEST_PRIVATE_VALUE: "must-not-inherit",
  };
  delete env.INDEX_PATH;
  const script = `const {collectQmd}=require(${JSON.stringify(require.resolve("../lib/knowledge-qmd"))});console.log(JSON.stringify(collectQmd(${JSON.stringify(config)},${JSON.stringify(now)})))`;
  const run = () =>
    JSON.parse(
      execFileSync(process.execPath, ["-e", script], { env, encoding: "utf8" }),
    )[0];
  assert.equal(run().status, "error");
  assert.equal(fs.existsSync(index), false);
  fs.writeFileSync(index, "synthetic index placeholder");
  fs.writeFileSync(
    path.join(root, "qmd"),
    `#!${process.execPath}\nif(process.env.TEST_PRIVATE_VALUE)process.exit(1);console.log('No files found in collection: notes');`,
    { mode: 0o700 },
  );
  assert.equal(run().status, "ready");
  fs.writeFileSync(
    path.join(root, "qmd"),
    `#!${process.execPath}\nprocess.stdout.write('x'.repeat(300000));`,
  );
  assert.equal(run().status, "error");
});
