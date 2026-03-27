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

const PACKAGE_VERSION = getPackageVersion()

const TOOL_DESCRIPTION = `Run quality checks on code files and auto-fix deterministic issues.

Phase 1 (Local, ~2-3s): TypeScript + ESLint + SonarJS (~60 rules) + AST fixers
Phase 2 (Server, optional): Deep SonarQube analysis (only if configured)

🎯 Phase 1 is comprehensive - most users won't need Phase 2!

Auto-fixes (ESLint + AST):
- Curly braces on single-statement if (AST)
- Single-expression arrow bodies where safe (AST)

Code Quality Limits:
- File: max 400 lines
- Function: max 50 lines, max 5 params, max 4 depth, max 20 statements
- Complexity: Cognitive max 15, Cyclomatic max 10
- Security: no-eval, no-new-func, no-implied-eval
- Best Practices: eqeqeq, no-throw-literal, prefer-promise-reject-errors`

const server = new McpServer({ name: 'ai-quality-gate', version: PACKAGE_VERSION })

server.registerTool(
  'quality_fix',
  {
    description: TOOL_DESCRIPTION,
    inputSchema: { files: z.array(z.string()).min(1).describe('Array of file paths to check') }
  },
  async ({ files }) => toToolResponse(await runQualityFixForFiles(files))
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
