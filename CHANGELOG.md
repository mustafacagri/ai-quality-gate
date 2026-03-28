## [1.0.3](https://github.com/mustafacagri/ai-quality-gate/compare/v1.0.2...v1.0.3) (2026-03-28)


### Bug Fixes

* **ci:** single npm registry publish and normalize package.json for npm ([7ff56a5](https://github.com/mustafacagri/ai-quality-gate/commit/7ff56a56983fe3b5ec7d9485f2860d0feccfc97b))

## [1.0.2](https://github.com/mustafacagri/ai-quality-gate/compare/v1.0.1...v1.0.2) (2026-03-28)


### Bug Fixes

* **ci:** add skip-publish logic for npm and GitHub Packages ([261c5c6](https://github.com/mustafacagri/ai-quality-gate/commit/261c5c6c5183a33424f3d2bd3990b441cf9bbeb0))

## [1.0.1](https://github.com/mustafacagri/ai-quality-gate/compare/v1.0.0...v1.0.1) (2026-03-27)


### Bug Fixes

* **ci:** add issues write permission for semantic-release github plugin ([86379d4](https://github.com/mustafacagri/ai-quality-gate/commit/86379d4056a368c7961d3314e5a339208f74c7eb))

# 1.0.0 (2026-03-27)


### Bug Fixes

* finalize automated OIDC release pipeline ([fc02b39](https://github.com/mustafacagri/ai-quality-gate/commit/fc02b39d1ff4772cf8989c33c1db0e673900ae56))
* upgrade node to v24 for future-proof ci compatibility ([69b22d6](https://github.com/mustafacagri/ai-quality-gate/commit/69b22d6d19db556a305e62afeef11fdd6177bbb1))

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
