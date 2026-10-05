# Memory and topic snapshot collectors

`node scripts/knowledge.js preview --workspace /path/to/workspace` reads only.
`node scripts/knowledge.js collect --workspace /path/to/workspace` explicitly writes
`state/command-center/knowledge.json` for Command Center's knowledge explorer.
Use `--profile NAME --agent ID` to select a nondefault identity. Existing foreign
snapshots refuse overwrite. Root must be a real directory, not a symlink alias.

## Included adapters

- `files`: Markdown under `memory/`, preserving directory relationships.
- `cerebro`: Markdown under `cerebro/topics/`; a `topic.md` turns its containing
  directory into a topic node, with thread folders/documents as children.

This is browsing, not a second memory engine. It does **not** read root `MEMORY.md`,
execute queries, modify source files, call an LLM, schedule collection, create topic
links by title, or infer topic links. QMD collection browsing is opt-in below; interactive search
and automatic indexing are not implemented. Other providers can supply the same schema.

The output has schemaVersion/profile/agentId and sources. Each source declares its
adapter, status, collection time, latest source-file modification time and documents.
Documents have opaque stable path-derived IDs, parent IDs, kind, title, sourceRef,
updatedAt, a plain-text excerpt, explicit truncation, and optional original URL.
File references are relative and do not expose absolute workspace paths.

## Bounds and privacy

Two named roots only; no symlink directories/files or FIFOs. Hidden files/directories
are excluded. Each source is bounded to 200 nodes, 600 traversal/entry steps, depth 8,
64 KiB per file, 12,000 characters per preview and 450,000 encoded document bytes.
Limits or unreadable files mark coverage partial. Missing roots are unavailable;
unsafe roots are errors. JSON/text files outside Markdown are intentionally omitted.
Directory enumeration is bounded, and source text gets the shared credential-pattern
redactor. This does not guarantee removal of every sensitive fact; only expose the
snapshot through authorized dashboard access. Never publish a real snapshot in a PR
or public preview.

The CLI prints only source status/count/time. Full excerpts are in the private local
snapshot, not console output. Collection uses a workspace lock, identity check and
atomic mode-0600 output. No previous snapshot is merged into a failed collection;
the next view must show current unavailable/partial state instead of hidden stale data.
Collection and last-source-update timestamps are distinct: scanning old files does
not refresh their actual knowledge. No deletion or source status changes occur.

Use a scratch workspace and synthetic Markdown first. Validate against Command
Center's `validateKnowledge` before enabling a real workspace. Stop a separate
collector/scheduler before changing source trees; concurrent directory replacement
is not a supported operation. This command never restarts the dashboard or gateway.

## Optional QMD collection browsing

Create a private workspace-relative `qmd-knowledge.json`:

```json
{"schemaVersion":1,"profile":"","agentId":"main","index":"index","collections":["notes"]}
```

Then preview or collect with:

```bash
node scripts/knowledge.js preview --workspace /path/to/workspace --qmd-config qmd-knowledge.json
node scripts/knowledge.js collect --workspace /path/to/workspace --qmd-config qmd-knowledge.json
```

The explicit profile/agent binding must match CLI identity. Only named collections
(maximum two) are read, never all QMD collections implicitly. The installed `qmd`
on PATH supplies `ls COLLECTION` and exact collection-qualified `multi-get --json`.
No shell interpolation, glob lookup, update, embed, query, download or model call.
An existing regular named index must be present at `$XDG_CACHE_HOME/qmd/INDEX.sqlite`
(or `~/.cache/qmd/INDEX.sqlite`). Conflicting `INDEX_PATH` overrides are rejected.
The child receives only PATH, HOME, locale and explicit index/config-cache settings,
not unrelated credential environment variables. Use a trusted installed QMD CLI;
this is a command wrapper, not an OS sandbox. QMD may maintain its own SQLite metadata.

Compatibility: the CLI must support virtual `qmd://COLLECTION/path.md` references
in `ls` and JSON `{file,title,body}` / `{file,skipped}` rows in exact-list multi-get.
Unknown formats stay partial/error rather than silently exposing another collection.
No SQLite schema dependency or QMD upgrade is required.

Each source includes the first 20 eligible paths in lexical order, at most 100 nodes,
45,000 encoded document bytes, 3,000-character previews, 80 lines and 32 KiB input
per document. Skipped documents and limits show partial coverage. Hidden paths,
traversal, globs, list delimiters and control characters are rejected. Each subprocess
has a 10-second timeout, 256 KiB output cap, and no stdin; all QMD work shares a
25-second deadline. Failed sources clear their documents without breaking file/Cerebro
sources. No scheduled sync is installed. Collection folder structure is not an
inferred topical ontology. The `qmd://` source reference is a citation, not an
executable browser link. Collection snapshots can contain private information.

This QMD CLI does not provide authoritative modification/indexing timestamps in its
JSON document output. Both stay null/Unknown; collection time is not index freshness.
The viewer searches only the loaded sample. Semantic/full-corpus querying remains a
separate future capability. Configure indexes/collections for the intended operator
and workspace only; identical collection names do not prove the same access scope.
