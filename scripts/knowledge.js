#!/usr/bin/env node
try {
  const { runKnowledge } = require("../lib/knowledge");
  const out = runKnowledge(process.argv.slice(2));
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        sources: out.sources.map((s) => ({
          id: s.id,
          status: s.status,
          documents: s.documents.length,
          observedAt: s.observedAt,
          indexUpdatedAt: s.indexUpdatedAt,
        })),
      },
      null,
      2,
    ),
  );
} catch {
  console.error("KNOWLEDGE_OPERATION_FAILED");
  process.exitCode = 1;
}
