#!/usr/bin/env node
// Offline imports or explicit read-only Linear collection; never starts a sync job.
const { run } = require("../lib/projects/runtime");
run(process.argv.slice(2))
  .then((result) => {
    // Live project text stays in private snapshots, not routine terminal logs.
    const output =
      result.mode === "live-linear-once"
        ? {
            mode: result.mode,
            status: result.status || "preview",
            liveSyncConfigured: false,
            skippedSources: result.skippedSources || [],
            sources: result.snapshots.map((s) => ({
              sourceId: s.sourceId,
              status: s.status,
              observedAt: s.observedAt,
              projectCount: s.projects.length,
            })),
          }
        : result;
    console.log(JSON.stringify(output, null, 2));
    if (
      result.mode === "live-linear-once" &&
      (result.skippedSources?.length ||
        result.snapshots.some((s) => s.status !== "ready"))
    )
      process.exitCode = 2;
  })
  .catch((error) => {
    console.error(
      error.code?.startsWith("PROJECT_")
        ? error.code
        : "PROJECT_OPERATION_FAILED",
    );
    process.exitCode = 1;
  });
