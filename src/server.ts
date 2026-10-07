/**
 * AI Quality Gate - MCP Server
 * AI code quality automation
 *
 * Principal Level - Zero Workarounds
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as z from 'zod/v4'

import { shouldUseCliMode } from '@/cli/parseCli'
import { runCli } from '@/cli/run'
import { getPackageVersion } from '@/utils/packageVersion'

import { runQualityFixForFiles, toToolResponse } from '@/server/qualityFixHandlers'
import { errorMessage } from '@/utils/errorMessage'

const PACKAGE_VERSION = getPackageVersion()

const TOOL_DESCRIPTION = `Run quality checks on code files and auto-fix deterministic issues.

Phase 1 (Local, ~2-3s): TypeScript + ESLint + SonarJS (~60 rules) + AST fixers
Phase 2 (Server, optional): Deep SonarQube analysis (only if configured)

🎯 Phase 1 is comprehensive - most users won't need Phase 2!

Auto-fixes (ESLint + AST):
- Curly braces on single-statement if, keeping a terminating semicolon (AST)
- Return-only arrow bodies, keeping the original signature (AST)

Vue SFCs: <script> and <script setup> are linted and auto-fixed in place, and a lang="ts" script is type checked with vue-tsc. A Vue file the compiler rejects stops the run before any edit.

When only findings the fixers cannot fix remain, the fixes already made are kept: "fixed" counts them, "remaining" lists what to fix by hand (success is false). If a fixer breaks the code (type error, SFC compile error, a tool failing to run) every edit is rolled back; those edits appear as "attempted", not "fixed".

If the same failure comes back unchanged three times in a row, error.code is PERSISTENT_FAILURE: stop retrying and ask the human.

Code Quality Limits:
- File: max 400 lines
- Function: max 50 lines, max 5 params, max 4 depth, max 20 statements
- Complexity: Cognitive max 15, Cyclomatic max 10
- Security: no-eval, no-new-func, no-implied-eval
- Best Practices: eqeqeq, no-throw-literal, prefer-promise-reject-errors`

const server = new McpServer({ name: 'ai-quality-gate', version: PACKAGE_VERSION })

async function resolveWorkspaceRoot(mcpServer: McpServer): Promise<string> {
  const { PROJECT_ROOT } = process.env

  if (PROJECT_ROOT) return PROJECT_ROOT

  try {
    const result = (await mcpServer.server.request({ method: 'roots/list' }, z.any())) as { roots?: { uri: string }[] }

    if (result.roots && result.roots.length > 0) {
      const rawUri = result.roots[0]?.uri

      if (rawUri) {
        return rawUri.replace(/^file:\/\//, '')
      }
    }
  } catch {
    // Client might not support roots/list, ignore
  }

  const { detectWorkspaceRoot } = await import('@/utils/detectWorkspaceRoot')

  return detectWorkspaceRoot(process.cwd())
}

server.registerTool(
  'quality_fix',
  {
    description: TOOL_DESCRIPTION,
    inputSchema: {
      files: z.array(z.string()).min(1).describe('Array of file paths to check (absolute or relative to workspace)')
    }
  },
  async ({ files }) => {
    const { resolveFilePath } = await import('@/utils/resolveFilePath')
    const workspaceRoot = await resolveWorkspaceRoot(server)

    // Resolve all files to absolute paths
    const resolvedFiles: string[] = []

    try {
      for (const file of files) {
        resolvedFiles.push(resolveFilePath(file, workspaceRoot))
      }
    } catch (error) {
      // If auto-resolution fails, return the clear error message to the AI
      return {
        content: [
          {
            type: 'text',
            text: errorMessage(error)
          }
        ],
        isError: true
      }
    }

    return toToolResponse(await runQualityFixForFiles(resolvedFiles))
  }
)

if (shouldUseCliMode(process.argv)) {
  const code = await runCli(process.argv)
  process.exit(code)
}

try {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[ai-quality-gate] MCP Server started')
} catch (error) {
  console.error('[ai-quality-gate] Fatal error:', error)
  process.exit(1)
}
