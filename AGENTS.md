# AGENTS.md — Development Guide for openclaw-spacesuit

> **This file is for REPO CONTRIBUTORS, not workspace users.**
> The file at `base/AGENTS.md` is the framework template that gets installed into user workspaces.
> This file lives at the repo root and provides development rules for this repo itself.

## ⚠️ Golden Rule: This is OPEN SOURCE

**NEVER add any of the following to this repo:**
- Personal names, usernames, or identifiers
- API keys, tokens, or secrets (even examples that look real)
- Machine names, hostnames, IP addresses
- Company names, project names, or internal references
- Anything that ties this repo to a specific person or organization

All base files and templates must be **generic** — useful for ANY OpenClaw user, anywhere.

Run `make test` before every commit to catch accidental leaks.

## Repository Structure

```
openclaw-spacesuit/
├── base/              # Framework content (inserted between SPACESUIT markers)
├── templates/         # Full-file templates with placeholders + user sections
├── scripts/           # install.sh, upgrade.sh, diff.sh
├── tests/             # Unit tests (bash)
├── SKILL.md           # ClawHub package metadata
├── VERSION            # Semver version string
├── Makefile           # Dev + user targets
├── CHANGELOG.md       # Release notes
└── AGENTS.md          # THIS FILE (dev guide, not installed to workspaces)
```

## Development Rules

### 1. Keep base/ and templates/ in sync

Every base file has a corresponding template. If you edit `base/X.md`, verify that `templates/X.md.tmpl` still references it correctly via `{{SPACESUIT_BASE_*}}` placeholders.

### 2. Section markers must be consistent

Templates use these markers to wrap framework content:
```
<!-- SPACESUIT:BEGIN SECTION_NAME -->
{{SPACESUIT_BASE_SECTION_NAME}}
<!-- SPACESUIT:END -->
```

- `SECTION_NAME` must match the key in `install.sh`'s `BASE_MAP` and `upgrade.sh`'s `SECTION_MAP`
- Begin marker includes the section name; end marker is always just `<!-- SPACESUIT:END -->`
- Never nest markers

### 3. Scripts must work from installed path

When installed via ClawHub, this repo lives at `skills/spacesuit/` inside a workspace. All scripts must work when invoked from that path:
```
skills/spacesuit/scripts/install.sh
skills/spacesuit/scripts/upgrade.sh
```
Use `$SCRIPT_DIR` and relative paths, never hardcoded absolute paths.

### 4. Test before committing

```bash
make test
```

This runs all tests in `tests/`. Every PR must pass. The test suite checks:
- Install/upgrade functionality
- Marker integrity across base/ and templates/
- No private data in any tracked file

### 5. Follow conventional commits

```
feat: add new base section for X
fix: preserve trailing newlines during upgrade
docs: update SKILL.md description
test: add upgrade idempotency test
chore: bump version to 0.2.0
```

### 6. Version bumping

- Update `VERSION` file (semver: MAJOR.MINOR.PATCH)
- Update version in `SKILL.md` metadata table
- Add entry to `CHANGELOG.md`

## Adding a New Managed File

1. Create `base/NEWFILE.md` with the framework content
2. Create `templates/NEWFILE.md.tmpl` with markers + user sections
3. Add the placeholder mapping to `scripts/install.sh` (`BASE_MAP`)
4. Add the section mapping to `scripts/upgrade.sh` (`SECTION_MAP` and `TARGET_MAP`)
5. Add tests for the new file
6. Update `SKILL.md` "Files Managed" table

## Testing

```bash
make test              # Run full test suite
tests/run_tests.sh     # Same thing, directly
tests/test_install.sh  # Run a single test file
```

Tests create temporary directories and clean up after themselves. They should be safe to run anywhere.

## Core monitoring versus agent flavors

Command Center owns generic OpenClaw monitoring and extension-host infrastructure.
Spacesuit owns optional per-agent flavors and domain extensions. Do not add new
agent-specific business rules, workspace file conventions or panels to Command
Center core. Keep public flavor packages generic and private bindings in the
workspace. Preserve localization, profile isolation and core-only operation.

Read [the flavor design](docs/architecture/agent-flavors.md) before adding panels or collectors.
Read [the v1 implementation plan](docs/plans/flavor-packages-v1.md) and
[flavor runbook](flavors/business-operations/README.md) before changing the CLI.
Command Center must work independently out of the box. Spacesuit is its highly
recommended companion but **has no human-agent interaction UX on its own**;
its scaffold and collectors alone do not provide that UI. Do not promise an
unimplemented chat composer or interaction control.

Flavor code must preserve English/Chinese labels, schema/identity checks and input
bounds. Manifests are data only: never dispatch shell commands, arbitrary scripts
or browser HTML from them. Keep flavors opt-in and selection/collection separate.
The dependency-free Node tests run as part of `make test` alongside Bash tests.

## Project tracker adapters

Read [the tracker runbook](docs/adapters/project-trackers.md) before changing project
adapters. Preserve native IDs/statuses, outcome-versus-task semantics, unknown
metrics, read-only transport bounds, explicit per-workspace identity and source
failure isolation. Never infer cross-provider relationships by title or embed
credentials in config/snapshots. Memory/topic adapters are separately composable.
