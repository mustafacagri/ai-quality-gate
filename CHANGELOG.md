# Changelog

All notable changes to this project are documented in this file.

## [0.0.1] - 2026-03-27

### Added

- **MCP:** `quality_fix` tool — Phase 1 (TypeScript, embedded ESLint + SonarJS, AST fixers, Prettier, JSON validator with optional i18n locale checks) and optional Phase 2 (SonarQube).
- **CLI:** `--setup` wizard, `--check`, `--fix`, phase flags; config via `.quality-gate.yaml` / `.quality-gate.json` (discovery + `QUALITY_GATE_CONFIG`).
- **Config:** `fixers` toggles, optional `customRules` (regex per line), Sonar env / nested `sonar` block; Zod-validated merge with environment variables.
- **Project root:** when `PROJECT_ROOT` is unset, infer by walking up from `process.cwd()` for `package.json` or `tsconfig.json` (`findProjectRoot`); `PROJECT_ROOT` remains an optional override.
- **Docs:** README MCP section (npx, global binary, Sonar, env reference); `.cursor/mcp.json.example` with commented env catalog; troubleshooting for missing `quality_fix`.
- **Tests & tooling:** Vitest coverage, contract/integration tests for ESLint embedding and validators.
