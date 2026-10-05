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
links by title, or connect QMD. Other retrieval providers can implement the same
snapshot schema independently. QMD indexing and search remain future integration.

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
