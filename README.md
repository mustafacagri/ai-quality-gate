# AI Quality Gate

MCP Server for AI code quality automation.

[![npm version](https://badge.fury.io/js/ai-quality-gate.svg)](https://www.npmjs.com/package/ai-quality-gate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What It Does

AI writes code → calls `quality_fix` → Server fixes what it can → Reports remaining issues to AI.

**Hybrid Approach:**

- **Phase 1:** ESLint + 627 rules + Prettier (~2-8s, always runs)
- **Phase 2:** SonarQube Server (~30-60s, optional)

**Important: ESLint vs Prettier**

| Tool         | Source                                         | Config                                           |
| ------------ | ---------------------------------------------- | ------------------------------------------------ |
| **ESLint**   | Project's config (if exists) or MCP's embedded | `.eslintrc.*` / `eslint.config.*` / MCP embedded |
| **Prettier** | **Project's own**                              | Project's `prettier.config.mjs`                  |

> ESLint rules are controlled by MCP for consistent quality gates.
> Prettier uses project's config so formatting matches project preferences.

**Phase 1 Rule Coverage:**

| Plugin            | Rules   | Description                 |
| ----------------- | ------- | --------------------------- |
| SonarJS           | 201     | Security, bugs, code smells |
| Unicorn           | 127     | Modern JS best practices    |
| ESLint Core       | 108     | JavaScript fundamentals     |
| TypeScript-ESLint | 99      | TypeScript-specific rules   |
| RegExp            | 60      | Regex best practices        |
| Import            | 11      | Import/export rules         |
| Promise           | 10      | Async/await best practices  |
| Node.js (n)       | 9       | Node.js specific rules      |
| Unused Imports    | 2       | Auto-remove unused imports  |
| **Total**         | **627** |                             |

---

## Installation

### Prerequisites

- **Node.js 18+** on your PATH (`node -v`).
- **Cursor**, **Antigravity**, **OpenCode** (or another MCP-capable editor) with MCP enabled.

Project root is **auto-detected** when `PROJECT_ROOT` is omitted: the server walks up from the MCP process working directory until it finds `package.json` or `tsconfig.json`. Set `PROJECT_ROOT` in `env` only to analyze a different tree than the inferred root.

---

### MCP configuration (Cursor)

Open **Settings → Tools & MCP → Edit** (user `mcp.json`). Add **one** server block; the examples below match [`.cursor/mcp.json.example`](.cursor/mcp.json.example) (JSONC with comments — if your editor rejects comments, copy the JSON blocks below only).

**Server name vs tool name:** The key under `mcpServers` (e.g. `"ai-quality-gate"`) is only the label for that connection in Cursor. The MCP **tool** your agent calls is always `quality_fix` — that name is fixed by this package and is separate from the server key and from `ai-quality-gate`.

#### A) Recommended: `npx` (no global install)

Always runs the published package; good for teams and CI-like setups.

```json
{
  "mcpServers": {
    "ai-quality-gate": {
      "command": "npx",
      "args": ["-y", "ai-quality-gate"]
    }
  }
}
```

#### B) Optional: global `npm` install

After `npm i -g ai-quality-gate`, the `ai-quality-gate` binary is on your PATH:

```json
{
  "mcpServers": {
    "ai-quality-gate": {
      "command": "ai-quality-gate",
      "args": []
    }
  }
}
```

#### C) SonarQube (Phase 2)

Requires a running SonarQube instance, `sonar-scanner` available (see [SonarQube Setup](#optional-sonarqube-server-phase-2)), and all three variables below. Phase 1 still runs first.

```json
{
  "mcpServers": {
    "ai-quality-gate": {
      "command": "npx",
      "args": ["-y", "ai-quality-gate"],
      "env": {
        "SONAR_HOST_URL": "http://localhost:9000",
        "SONAR_TOKEN": "your_sonar_token",
        "SONAR_PROJECT_KEY": "your_project_key"
      }
    }
  }
}
```

#### D) Optional environment variables (any server)

Add an `"env"` object when you need overrides. Merge order for config is **defaults → `.quality-gate.yaml` / `.quality-gate.json` → environment variables**.

| Variable              | When to set                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `QUALITY_GATE_CONFIG` | Absolute path to a specific `.quality-gate.yaml` or `.quality-gate.json` (skips walking directories). |
| `PROJECT_ROOT`        | Force project root if auto-detection is wrong for your layout.                                        |
| `SONAR_HOST_URL`      | SonarQube server URL (with Phase 2).                                                                  |
| `SONAR_TOKEN`         | SonarQube token (with Phase 2).                                                                       |
| `SONAR_PROJECT_KEY`   | SonarQube project key (with Phase 2).                                                                 |
| `SONAR_SCANNER_PATH`  | Full path to `sonar-scanner` if not on `PATH`.                                                        |
| `PHASE1_TIMEOUT`      | Phase 1 timeout (ms), default `30000`.                                                                |
| `PHASE2_TIMEOUT`      | Phase 2 timeout (ms), default `300000`.                                                               |
| `ENABLE_I18N_RULES`   | `true` / `false` — stricter JSX literal checks for i18n projects.                                     |

---

### MCP configuration

#### Cursor, Antigravity, etc..

```json
{
  "mcpServers": {
    "ai-quality-gate": {
      "command": "npx",
      "args": ["-y", "ai-quality-gate"]
    }
  }
}
```

#### (OpenCode)

Create or edit **OpenCode config** (typically `~/.config/opencode/opencode.json` or project-level config):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "ai-quality-gate": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "ai-quality-gate"]
    }
  }
}
```

Environment variables can be added under the server config if needed (see [C) SonarQube (Phase 2)](#c-sonarqube-phase-2) above).

---

### Local development (this repository)

To dogfood or contribute:

1. **`yarn build`** — generates `dist/server.js`.
2. Point MCP at the built file (absolute paths):

```json
{
  "mcpServers": {
    "ai-quality-gate-dev": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/ai-quality-gate/dist/server.js"]
    }
  }
}
```

3. Reload MCP. Use `env.PROJECT_ROOT` only if the repo you analyze differs from the inferred root.

---

### 2. Add AI Rule

`Settings` → `Rules and Commands` → `Add Rule`:

```
After every code change, before telling the user "done",
AI must call the quality_fix MCP tool. This is mandatory.
```

### 3. Use It

```
AI writes code → calls quality_fix → Fixes errors → "Done ✅"
```

---

## CLI: interactive config (`--setup`)

The **interactive wizard** creates or updates `.quality-gate.yaml` without hand-editing: it walks you through project root, optional SonarQube (host URL + project key; **token is not saved to disk** — use `SONAR_TOKEN` in your environment), which Phase 1 tools to enable (ESLint, curly-brace / arrow AST fixers, Prettier, JSON validator), timeouts, and i18n rules. The generated file includes a `fixers:` block you can adjust later.

After `yarn build` (or install from npm), run from the target project (or any path under it):

```bash
node dist/server.js --setup
```

`PROJECT_ROOT` is inferred when unset (see [MCP configuration](#mcp-configuration-cursor)). Use the same entrypoint as the MCP server (`node dist/server.js` or `npx ai-quality-gate`); only the `--setup` flag switches to wizard mode. Answer prompts in the terminal; on success you get a ready-to-use config next to your project root.

**Other CLI modes:** `--check` (read-only Phase 1), `--fix` (default behavior when using CLI quality run), `--phase1-only`, `--phase2-only` — see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

---

## Optional: SonarQube Server (Phase 2)

Configure Sonar env in MCP as in **[C) SonarQube (Phase 2)](#c-sonarqube-phase-2)** above, or copy from [`.cursor/mcp.json.example`](.cursor/mcp.json.example). You need **`sonar-scanner`** on your machine for analysis (see below).

### SonarQube Setup

#### Docker (Recommended)

```bash
# Start SonarQube
docker run -d --name sonarqube -p 9000:9000 sonarqube:community

# First login: admin/admin → change password
# http://localhost:9000
```

#### Docker Compose

```yaml
# docker-compose.yml
version: '3'
services:
  sonarqube:
    image: sonarqube:community
    ports:
      - '9000:9000'
    volumes:
      - sonarqube_data:/opt/sonarqube/data
      - sonarqube_logs:/opt/sonarqube/logs
      - sonarqube_extensions:/opt/sonarqube/extensions

volumes:
  sonarqube_data:
  sonarqube_logs:
  sonarqube_extensions:
```

```bash
docker-compose up -d
```

### Creating SonarQube Token

1. http://localhost:9000 → Login (admin)
2. **My Account** → **Security** → **Generate Tokens**
3. Select token type: **Global Analysis Token**
4. Copy token → use as `SONAR_TOKEN`

### Installing sonar-scanner

| Platform    | Method       | Command                                    |
| ----------- | ------------ | ------------------------------------------ |
| **Windows** | npm (global) | `npm install -g sonarqube-scanner`         |
| **Windows** | Chocolatey   | `choco install sonar-scanner`              |
| **macOS**   | npm (global) | `npm install -g sonarqube-scanner`         |
| **macOS**   | Homebrew     | `brew install sonar-scanner`               |
| **Linux**   | npm (global) | `npm install -g sonarqube-scanner`         |
| **Docker**  | Container    | `docker run sonarsource/sonar-scanner-cli` |

For custom path: `SONAR_SCANNER_PATH` env var

---

## Configuration

Optional files (discovered by walking up from the inferred project root — same algorithm as `package.json` / `tsconfig.json` — or from `PROJECT_ROOT` when set): **`.quality-gate.yaml`** (preferred) or **`.quality-gate.json`**. Same fields as environment variables (camelCase); you may nest Sonar settings under `sonar: { hostUrl, token, projectKey, scannerPath }`.

Merge order: **defaults → config file → environment variables** (ENV wins on conflicts).

Set **`QUALITY_GATE_CONFIG`** to an explicit path to skip discovery.

### Custom rules (`customRules`)

Optional **line-based regex** checks on lintable files (Phase 1). Each match is reported as an issue with `rule` set to `custom:<id>` (and included in `quality_fix` `remaining`). Example:

```yaml
customRules:
  - id: no-console
    message: 'Console.log is not allowed'
    pattern: 'console\\.log\\('
    severity: error
  - id: no-debugger
    message: 'Debugger statement found'
    pattern: 'debugger'
    severity: warning
```

Patterns use JavaScript `RegExp` source (escape backslashes as in YAML strings). Invalid patterns are skipped at runtime with a log line.

### JSON validator & i18n locale files

When **`fixers.jsonValidator`** is enabled and you pass JSON paths that match locale patterns (for example `locales/en.json` / `locales/tr.json`), the tool compares keys across those files.

- **Syntax errors, invalid UTF-8 BOM, etc.** → reported as `issues` and **fail** Phase 1 / `quality_fix` until fixed.
- **Missing or extra keys between locale files** → collected as **`i18nIssues`** in the validator result and printed as **warnings on stderr** during Phase 1. They do **not** set `passed: false` and do **not** block the gate.

Treat `i18nIssues` as advisory unless you add your own CI check on top.

---

## Environment Variables

All variables are **optional** unless you use Phase 2, which requires **`SONAR_HOST_URL`**, **`SONAR_TOKEN`**, and **`SONAR_PROJECT_KEY`** together.

| Variable              | Description                                                                                                                  | Example                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `QUALITY_GATE_CONFIG` | Absolute path to a `.quality-gate.yaml` or `.quality-gate.json` file. Skips walking parent directories for config discovery. | `/app/ci/quality-gate.yaml`            |
| `PROJECT_ROOT`        | Override detected project root. Default: walk up from the process cwd until `package.json` or `tsconfig.json` is found.      | `/Users/me/my-repo`                    |
| `SONAR_HOST_URL`      | SonarQube server base URL (Phase 2).                                                                                         | `http://localhost:9000`                |
| `SONAR_TOKEN`         | SonarQube authentication token (Phase 2). Prefer env / secret store; avoid committing.                                       | `sqa_xxx...`                           |
| `SONAR_PROJECT_KEY`   | SonarQube project key (Phase 2).                                                                                             | `my-project`                           |
| `SONAR_SCANNER_PATH`  | Full path to the `sonar-scanner` executable if it is not on `PATH`.                                                          | `/opt/sonar-scanner/bin/sonar-scanner` |
| `PHASE1_TIMEOUT`      | Phase 1 subprocess timeout in milliseconds.                                                                                  | `30000` (default)                      |
| `PHASE2_TIMEOUT`      | Phase 2 (Sonar) timeout in milliseconds.                                                                                     | `300000` (default)                     |
| `ENABLE_I18N_RULES`   | Set to `true` to enable ESLint rules that flag raw string literals in JSX (for i18n-heavy apps).                             | `false` (default)                      |

---

## Auto-Fix

Phase 1 automatically fixes these issues:

### ESLint Auto-Fix (~100+ rules)

```typescript
// var → const/let
var x = 1        →  const x = 1

// forEach → for...of (unicorn/no-array-for-each)
arr.forEach(x => f(x))  →  for (const x of arr) f(x)

// Nested ternary → extracted (unicorn/no-nested-ternary)
a ? b : c ? d : e  →  const temp = c ? d : e; a ? b : temp

// Unused imports removed
import { unused } from 'x'  →  (removed)

// Type imports (consistent-type-imports)
import { Type } from 'x'  →  import type { Type } from 'x'

// Optional chain (prefer-optional-chain)
a && a.b && a.b.c  →  a?.b?.c

// Regex optimization (regexp/*)
/[0-9]/  →  /\d/
```

### AST Auto-Fix

```typescript
// Remove unnecessary curly braces (single-line if)
if (x) { return true }  →  if (x) return true
```

### Prettier Formatting

After ESLint fixes, Prettier runs to ensure consistent formatting:

```typescript
// ESLint removes braces but leaves awkward format:
if (x) return true

// Prettier fixes to single line:
if (x) return true
```

> **Note:** Prettier uses project's config, not MCP's.

**Everything else:** Reported to AI, AI fixes it.

---

## API

### Tool: `quality_fix`

```typescript
// Input
{
  files: string[] // File paths to check
}

// Output
{
  phase: "local" | "server" | "complete",
  success: boolean,
  message: string,
  fixed: {
    eslint: number,          // ESLint auto-fixes
    curlyBraces: number,   // AST: single-statement if braces
    singleLineArrow: number, // AST: arrow body style
    prettier: number,      // Prettier formatting
    json: number           // JSON validation passes counted
  },
  remaining: Issue[],
  timing: {
    phase1: string,
    phase2?: string,
    total: string
  }
}
```

---

## Feature Flags

### `ENABLE_I18N_RULES`

For projects with internationalization (i18n), enable literal string detection:

```json
{
  "env": {
    "ENABLE_I18N_RULES": "true"
  }
}
```

When enabled:

```tsx
// ⚠️ Warning
<h1>Hello World</h1>

// ✅ OK
<h1>{t('hello')}</h1>
```

---

## Troubleshooting

### MCP: `quality_fix` does not appear

1. **Node.js 18+** — run `node -v` and `npx --version`.
2. **Reload** Cursor after editing `mcp.json` (or use the MCP refresh control).
3. **JSON** — the file must be valid JSON (no trailing commas). Copy from the [MCP configuration](#mcp-configuration-cursor) section if unsure.
4. **Global install** — if you use `"command": "ai-quality-gate"`, run `npm i -g ai-quality-gate` once so the binary exists.

### Windows

**"npx not found" error:**

```bash
# Node.js must be in PATH
# Check in PowerShell:
where.exe npx
```

**Permission denied:**

```bash
# Run PowerShell as Administrator
```

### macOS / Linux

**"Permission denied" error:**

```bash
# Fix npm global directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
```

**"sonar-scanner not found" error:**

```bash
# Install via Homebrew
brew install sonar-scanner

# Or via npm
npm install -g sonarqube-scanner
```

### SonarQube

**"Insufficient privileges" error:**

- SonarQube → **Administration** → **Security** → **Global Permissions**
- Give **Anyone** group **Browse** and **Execute Analysis** permissions

**"Project not found" error:**

- Create project manually for first analysis: **Projects** → **Create Project** → **Manually**

---

## Clone & build (contributors)

```bash
git clone https://github.com/mustafacagri/ai-quality-gate.git
cd ai-quality-gate
yarn install
yarn build
```

Use [Local development (this repository)](#local-development-this-repository) for MCP pointing at `dist/server.js`.

---

## Docs

- [SETUP.md](./SETUP.md) — Local setup (if included in your tree)
- [AGREEMENTS.md](./docs/AGREEMENTS.md), [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), etc. — optional; some files may be omitted in minimal clones. **README** + **`.cursor/mcp.json.example`** are enough to run the published package.

---

## Principles

- ✅ 627 ESLint rules (SonarJS, Unicorn, TypeScript-ESLint, etc.)
- ✅ Prettier integration (uses project's config)
- ✅ AST-based transforms (no regex)
- ✅ Verify after each fix
- ✅ Rollback on error
- ✅ ESLint config discovery (uses project config if available, otherwise embedded)
- ✅ Zero workaround
- ✅ Principal level

---

## License

MIT © [Mustafa Çağrı Güven](https://github.com/mustafacagri)

---

**v0.0.1** — Initial release! MCP `quality_fix`, Phase 1/2 pipeline, CLI, config files, custom rules (see [CHANGELOG](./CHANGELOG.md))
