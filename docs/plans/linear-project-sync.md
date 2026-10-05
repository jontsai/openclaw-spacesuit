# Read-only Linear project collection

## Goal

Collect real Linear projects into the existing project snapshot contract without
tracker writes, a dashboard restart, a new scheduler, or credential persistence.

## Acceptance

- Explicit sync-preview (no files written) and sync (local snapshots only).
- Fixed HTTPS endpoint and read-only query; refuse redirects and organization mismatch.
- Credential supplied by host environment, never flags/config values or snapshots.
- Bounded response streaming, pagination and deadline; no automatic retry storm.
- Existing offline importer remains compatible. Failed refresh retains old observed
  time and known projects only for the same organization and workspace identity.
- Synthetic tests for transport, identity, partial results and failure recovery.
- Read-only scratch pilot with the host credential; no production board activation.

## Files

Project adapter/runtime, new Linear transport, CLI summary, provider runbook,
README, changelog and focused tests. No base/templates or skill modifications.

## Validation

Run focused Node tests and complete Bash test runner, plus normalize a real response
and validate it with the Command Center host before opening a reviewable branch.
