const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { redactExtensionText: redact } = require("./flavors/redaction");
const NAME = /^[a-zA-Z0-9_-]{1,64}$/;
const fail = () => {
  throw new Error("QMD_COLLECTION_FAILED");
};
const key = (index, ref) =>
  `qmd-${crypto.createHash("sha256").update(`${index}:${ref}`).digest("hex").slice(0, 24)}`;
function validateQmd(config, identity) {
  if (
    !config ||
    config.schemaVersion !== 1 ||
    config.profile !== identity.profile ||
    config.agentId !== identity.agentId ||
    typeof config.index !== "string" ||
    !NAME.test(config.index) ||
    !Array.isArray(config.collections) ||
    config.collections.length < 1 ||
    config.collections.length > 2 ||
    config.collections.some((c) => typeof c !== "string" || !NAME.test(c)) ||
    new Set(config.collections).size !== config.collections.length
  )
    fail();
  return config;
}
function safeRef(ref, collection) {
  if (
    typeof ref !== "string" ||
    ref.length > 400 ||
    !ref.startsWith(`qmd://${collection}/`)
  )
    return false;
  const relative = ref.slice(`qmd://${collection}/`.length);
  return (
    relative.endsWith(".md") &&
    !/[\\,?*\[\]{}\x00-\x1f\x7f]/.test(relative) &&
    relative.split("/").every((part) => part && !part.startsWith(".")) &&
    relative.split("/").length <= 8
  );
}
function runner(index) {
  // Pin the named existing index; never create a missing index or inherit INDEX_PATH.
  const file = path.resolve(
    process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
    "qmd",
    `${index}.sqlite`,
  );
  if (process.env.INDEX_PATH && path.resolve(process.env.INDEX_PATH) !== file)
    fail();
  if (fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()) fail();
  const env = {
    PATH: process.env.PATH,
    HOME: os.homedir(),
    NO_COLOR: "1",
    INDEX_PATH: file,
  };
  for (const name of ["XDG_CACHE_HOME", "XDG_CONFIG_HOME", "LANG"])
    if (process.env[name]) env[name] = process.env[name];
  return (args, timeout) =>
    execFileSync("qmd", [...args, "--index", index], {
      env,
      encoding: "utf8",
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 256 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
}
function collectQmd(config, now, execute) {
  const deadline = Date.now() + 25000;
  let run;
  try {
    run = execute || runner(config.index);
  } catch {
    /* each source visibly unavailable */
  }
  return config.collections.map((collection) => {
    const source = {
      id: `qmd-${config.index}-${collection}`,
      adapter: "qmd",
      label: `QMD · ${collection}`,
      status: "ready",
      observedAt: now,
      indexUpdatedAt: null,
      documents: [],
    };
    try {
      if (!run) fail();
      const call = (args) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) fail();
        const out = run(args, Math.min(10000, remaining));
        if (typeof out !== "string" || Buffer.byteLength(out) > 256 * 1024)
          fail();
        return out;
      };
      const listing = call(["ls", collection]);
      const refs = new Set();
      for (const line of listing.split("\n").filter(Boolean)) {
        const match = line.match(/\s(qmd:\/\/.*)$/);
        if (!match || !safeRef(match[1], collection)) {
          source.status = "partial";
          continue;
        }
        refs.add(match[1]);
      }
      const selected = [...refs].sort().slice(0, 20);
      if (refs.size > selected.length) source.status = "partial";
      if (!selected.length) {
        if (/^No files found in collection: [a-zA-Z0-9_-]+\s*$/.test(listing))
          source.status = "ready";
        else source.status = "partial";
        return source;
      }
      // A comma explicitly selects QMD's exact collection-scoped lookup path.
      // Single paths otherwise take the glob path and lose their collection prefix.
      const selection =
        selected.length === 1 ? [selected[0], selected[0]] : selected;
      const rows = JSON.parse(
        call([
          "multi-get",
          selection.join(","),
          "--json",
          "--max-bytes",
          "32768",
          "-l",
          "80",
        ]),
      );
      if (!Array.isArray(rows) || rows.length > 40) fail();
      const seen = new Set();
      let bytes = 0;
      const add = (doc) => {
        const size = Buffer.byteLength(JSON.stringify(doc));
        if (source.documents.length >= 100 || bytes + size > 45000) {
          source.status = "partial";
          return false;
        }
        bytes += size;
        source.documents.push(doc);
        return true;
      };
      for (const row of rows) {
        if (
          !row ||
          !safeRef(row.file, collection) ||
          !selected.includes(row.file)
        )
          fail();
        if (seen.has(row.file)) continue;
        seen.add(row.file);
        if (
          row.skipped ||
          typeof row.body !== "string" ||
          typeof row.title !== "string"
        ) {
          source.status = "partial";
          continue;
        }
        const segments = row.file
          .slice(`qmd://${collection}/`.length)
          .split("/");
        let parentId = null,
          prefix = `qmd://${collection}`;
        let parentMissing = false;
        for (const segment of segments.slice(0, -1)) {
          prefix += `/${segment}`;
          const id = key(config.index, prefix);
          if (
            !source.documents.some((d) => d.id === id) &&
            !add({
              id,
              parentId,
              kind: "folder",
              title: redact(segment).slice(0, 256),
              sourceRef: redact(prefix),
              excerpt: "",
              updatedAt: null,
              truncated: false,
              url: null,
            })
          ) {
            parentMissing = true;
            break;
          }
          parentId = id;
        }
        if (parentMissing) continue;
        add({
          id: key(config.index, row.file),
          parentId,
          kind: "document",
          title: redact(row.title || segments.at(-1)).slice(0, 256),
          sourceRef: redact(row.file),
          excerpt: redact(row.body).slice(0, 3000),
          updatedAt: null,
          truncated:
            row.body.length > 3000 ||
            /\[\.\.\. truncated \d+ more lines\]/.test(row.body),
          url: null,
        });
      }
      if (seen.size !== selected.length) source.status = "partial";
    } catch {
      source.status = "error";
      source.documents = [];
    }
    return source;
  });
}
module.exports = { validateQmd, collectQmd, safeRef };
