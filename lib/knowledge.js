const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { read, guarded, atomic } = require("./projects/runtime");
const { redactExtensionText: redact } = require("./flavors/redaction");
const { validateQmd, collectQmd } = require("./knowledge-qmd");
const OUTPUT = "state/command-center/knowledge.json";
const key = (ref) =>
  `doc-${crypto.createHash("sha256").update(ref).digest("hex").slice(0, 24)}`;
const fail = () => {
  throw new Error("KNOWLEDGE_OPERATION_FAILED");
};
function collectSource(workspace, adapter, root, label, now) {
  const source = {
    id: adapter,
    adapter,
    label,
    status: "ready",
    observedAt: now,
    indexUpdatedAt: null,
    documents: [],
  };
  let visits = 0,
    bytes = 0;
  const add = (doc) => {
    const size = Buffer.byteLength(JSON.stringify(doc));
    if (source.documents.length >= 200 || bytes + size > 450000) {
      source.status = "partial";
      return false;
    }
    bytes += size;
    source.documents.push(doc);
    return true;
  };
  function walk(relative, parentId, depth) {
    if (++visits > 600 || depth > 8) {
      source.status = "partial";
      return;
    }
    let dir;
    try {
      dir = guarded(workspace, relative);
      if (!fs.lstatSync(dir).isDirectory()) fail();
    } catch {
      source.status = "partial";
      return;
    }
    let entries;
    try {
      entries = [];
      const handle = fs.opendirSync(dir);
      try {
        let entry;
        while ((entry = handle.readSync())) {
          if (entries.length >= 600) {
            source.status = "partial";
            break;
          }
          entries.push(entry);
        }
      } finally {
        handle.closeSync();
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      source.status = "partial";
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (++visits > 600 || source.documents.length >= 200) {
        source.status = "partial";
        return;
      }
      const ref = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        source.status = "partial";
        continue;
      }
      if (entry.isDirectory()) {
        const doc = {
          id: key(ref),
          parentId,
          kind: "folder",
          title: redact(entry.name).slice(0, 256),
          sourceRef: redact(ref),
          updatedAt: null,
          excerpt: "",
          truncated: false,
          url: null,
        };
        if (add(doc)) walk(ref, doc.id, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const content = read(workspace, ref, 65536);
          if (content === null) fail();
          const updatedAt = fs
            .statSync(guarded(workspace, ref))
            .mtime.toISOString();
          if (!source.indexUpdatedAt || updatedAt > source.indexUpdatedAt)
            source.indexUpdatedAt = updatedAt;
          const title =
            content.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1] ||
            content.match(/^#\s+(.+)$/m)?.[1] ||
            entry.name;
          const excerpt = redact(content).slice(0, 12000);
          const doc = {
            id: key(ref),
            parentId,
            kind: entry.name === "topic.md" ? "topic" : "document",
            title: redact(title).slice(0, 256),
            sourceRef: redact(ref),
            updatedAt,
            excerpt,
            truncated: content.length > 12000,
            url: null,
          };
          // Topic folders become navigable topic documents; children retain identity.
          const folder =
            adapter === "cerebro" &&
            entry.name === "topic.md" &&
            source.documents.find(
              (d) => d.id === parentId && d.kind === "folder",
            );
          if (folder) {
            const size = Buffer.byteLength(JSON.stringify(doc));
            if (bytes + size > 450000) {
              source.status = "partial";
              continue;
            }
            bytes += size;
            Object.assign(folder, {
              ...doc,
              id: folder.id,
              parentId: folder.parentId,
            });
          } else add(doc);
        } catch {
          source.status = "partial";
        }
      } else if (!entry.isFile()) source.status = "partial";
    }
  }
  try {
    const target = guarded(workspace, root);
    if (!fs.existsSync(target)) {
      source.status = "unavailable";
      return source;
    }
    if (!fs.lstatSync(target).isDirectory()) fail();
    walk(root, null, 0);
  } catch {
    source.status = "error";
    source.documents = [];
  }
  return source;
}
function runKnowledge(args) {
  const command = args[0],
    opts = { profile: "", agentId: "main" };
  if (!["preview", "collect"].includes(command)) fail();
  const used = new Set();
  for (let i = 1; i < args.length; i += 2) {
    const name = {
      "--workspace": "workspace",
      "--profile": "profile",
      "--agent": "agentId",
      "--qmd-config": "qmdConfig",
    }[args[i]];
    if (!name || used.has(name) || args[i + 1] === undefined) fail();
    used.add(name);
    opts[name] = args[i + 1];
  }
  if (
    !opts.workspace ||
    !/^[a-zA-Z0-9_-]{0,64}$/.test(opts.profile) ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(opts.agentId)
  )
    fail();
  const workspace = path.resolve(opts.workspace);
  if (
    fs.realpathSync(workspace) !== workspace ||
    !fs.statSync(workspace).isDirectory()
  )
    fail();
  const prior = read(workspace, OUTPUT);
  if (prior) {
    const old = JSON.parse(prior);
    if (
      old.schemaVersion !== 1 ||
      old.profile !== opts.profile ||
      old.agentId !== opts.agentId
    )
      fail();
  }
  const configText = opts.qmdConfig
    ? read(workspace, opts.qmdConfig, 16384)
    : null;
  const qmd = opts.qmdConfig ? validateQmd(JSON.parse(configText), opts) : null;
  const now = new Date().toISOString();
  const result = {
    schemaVersion: 1,
    profile: opts.profile,
    agentId: opts.agentId,
    sources: [
      collectSource(workspace, "files", "memory", "Workspace memory", now),
      collectSource(
        workspace,
        "cerebro",
        "cerebro/topics",
        "Cerebro topics",
        now,
      ),
    ],
  };
  if (qmd) result.sources.push(...collectQmd(qmd, now));
  // Keep the combined pretty-printed snapshot within the shared atomic writer limit.
  // Children follow their parents, so removing tail nodes cannot create dangling links.
  while (Buffer.byteLength(JSON.stringify(result, null, 2)) + 1 > 1024 * 1024) {
    const source = [...result.sources]
      .reverse()
      .find((s) => s.documents.length);
    if (!source) fail();
    source.documents.pop();
    source.status = "partial";
  }
  if (command === "collect") {
    const lock = guarded(
      workspace,
      "state/command-center/.knowledge-lock",
      true,
    );
    fs.mkdirSync(lock, { mode: 0o700 });
    try {
      if (read(workspace, OUTPUT) !== prior) fail();
      if (
        opts.qmdConfig &&
        read(workspace, opts.qmdConfig, 16384) !== configText
      )
        fail();
      atomic(workspace, OUTPUT, result);
    } finally {
      fs.rmdirSync(lock);
    }
  }
  return result;
}
module.exports = { runKnowledge, collectSource };
