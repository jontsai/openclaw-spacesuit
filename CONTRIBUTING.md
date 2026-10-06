# Contributing to OpenClaw Spacesuit

> _"Join the Swarm. Evolve together."_

Thank you for considering contributing to OpenClaw Spacesuit! This project thrives on community involvement.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Contributions](#making-contributions)
- [Pull Request Process](#pull-request-process)
- [Publishing to ClawHub](#publishing-to-clawhub)
- [For AI Contributors](#for-ai-contributors)

## 📜 Code of Conduct

This project adheres to our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you're expected to uphold this code.

## 🚀 Getting Started

### Prerequisites

- Bash 4.0 or higher
- Node.js 18+ (flavor CLI and tests)
- Git
- jq (for JSON processing)
- An OpenClaw installation to test against

### Development Setup

1. **Fork the repository**

   Click the "Fork" button on GitHub to create your own copy.

2. **Clone your fork**

   ```bash
   git clone https://github.com/YOUR_USERNAME/openclaw-spacesuit.git
   cd openclaw-spacesuit
   ```

3. **Add upstream remote**

   ```bash
   git remote add upstream https://github.com/jontsai/openclaw-spacesuit.git
   ```

4. **Test installation**

   ```bash
   # Create a test workspace
   mkdir /tmp/test-workspace
   ./scripts/install.sh --workspace /tmp/test-workspace
   ```

## 🛠️ Making Contributions

### Types of Contributions

We welcome:

- 🐛 Bug fixes in scripts
- ✨ New data sync scripts (sync-*.sh)
- 📚 Documentation improvements
- 🧪 Test coverage
- 📝 Base file enhancements (AGENTS.md, SOUL.md, etc.)
- 🔧 Template improvements

### Before You Start

1. **Check existing issues** — Someone may already be working on it
2. **Open an issue first** — For significant changes, discuss before coding
3. **Keep changes focused** — One feature/fix per PR

### Contribution Areas

#### Base Files (`base/`)

The framework content that gets installed. Changes here affect all users on upgrade.

- Keep content universal (not user-specific)
- Maintain backward compatibility
- Test with `make upgrade-dry` before committing

#### Templates (`templates/`)

File templates with placeholder markers. Changes here affect new installations.

- Use `{{SPACESUIT_BASE_*}}` markers for framework sections
- Leave room for user customizations outside markers

#### Scripts (`scripts/`)

Utility scripts for installation, upgrade, and data gathering.

- **install.sh** — First-time setup
- **upgrade.sh** — Section-based merge upgrades
- **diff.sh** — Show pending changes
- **sync-*.sh** — Data gathering for dashboards

For new data scripts:
- Follow the `sync-operators.sh` pattern
- Support `--dry-run`, `--workspace`, `--profile` flags
- Handle missing directories gracefully
- Preserve user customizations (like roles)

## 📥 Pull Request Process

1. **Create a feature branch**

   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make your changes**

   - Write clear, commented code
   - Add/update tests if applicable
   - Update CHANGELOG.md

3. **Test your changes**

   ```bash
   # Test install on fresh workspace
   ./scripts/install.sh --workspace /tmp/test-ws
   
   # Test upgrade doesn't break existing
   ./scripts/upgrade.sh --workspace /tmp/test-ws --dry-run
   
   # Run any data scripts
   ./scripts/sync-operators.sh --workspace /tmp/test-ws --dry-run
   ```

4. **Commit with conventional commits**

   ```bash
   git commit -m "feat(scripts): add sync-sessions script"
   git commit -m "fix(upgrade): preserve user comments"
   git commit -m "docs: update README with new flags"
   ```

5. **Push and create PR**

   ```bash
   git push origin feat/your-feature
   ```

6. **PR Requirements**

   - Clear description of changes
   - Link to related issues
   - Passing tests (if any)
   - Updated documentation

## 📦 Publishing to ClawHub

Maintainers publish releases using ClawHub:

```bash
# Ensure VERSION and CHANGELOG.md are updated
clawhub publish /absolute/reviewed-staging-directory --slug spacesuit --version 0.4.0
```

Contributors should:
- Update VERSION, version.txt and SKILL.md together (SemVer)
- Add CHANGELOG.md entry
- Let maintainers handle the actual publish

## 🤖 For AI Contributors

AI agents (Claude, GPT, etc.) are welcome contributors! Guidelines:

1. **Identify yourself** — Use `Co-authored-by: AI Name <noreply@provider.com>`
2. **Follow the same process** — PRs, tests, documentation
3. **Be transparent** — Note if code was AI-generated
4. **Verify output** — Don't blindly commit AI suggestions

## 🏆 Recognition

Contributors are recognized in:
- Git commit history
- Release notes (for significant contributions)
- README acknowledgments (for major features)

## 💬 Getting Help

- **GitHub Issues** — Bug reports, feature requests
- **Discord** — [OpenClaw Community](https://discord.com/invite/clawd)
- **Discussions** — General questions, ideas

---

_"Every drone strengthens the Swarm."_

## Companion flavors

Keep Command Center independently usable; Spacesuit supplies optional flavors and
has no human-agent interaction UX alone. Follow
[the flavor runbook](flavors/business-operations/README.md) and preserve the v1
snapshot contract, bilingual labels, fixed read-only collectors and rollback tests.
Manifests must never execute commands or load arbitrary scripts. Run `make test`
with Bash 4+ and Node 18+ before proposing flavor changes.

## Project portfolio adapters

Follow [the tracker runbook](docs/adapters/project-trackers.md). Use synthetic
provider responses in tests; no credentials or real tracker writes. Keep snapshot
identity/status/freshness faithful, preserve unknown metrics, and test source
isolation, pagination bounds, timeouts and safe file access. Do not claim live
synchronization is configured when only local exports are imported.

## Releases

Follow [release preparation and migration checks](docs/releases/README.md).
`make release V=0.4.0` validates only; publication is a separate action.
