import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest'

const registerTool = vi.fn()
const connect = vi.fn().mockResolvedValue(undefined)

vi.mock('@/cli/parseCli', () => ({
  shouldUseCliMode: () => false,
  runCli: vi.fn()
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    registerTool = registerTool
    connect = connect
  }
}))

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn()
}))

vi.mock('@/utils/packageVersion', () => ({
  getPackageVersion: () => '0.0.0-test'
}))

describe('MCP server bootstrap', () => {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeAll(async () => {
    await import('./server')
  })

  afterAll(() => {
    exitSpy.mockRestore()
    consoleError.mockRestore()
  })

  it('constructs MCP server and registers quality_fix', () => {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers */
    expect(registerTool).toHaveBeenCalledWith(
      'quality_fix',
      expect.objectContaining({
        description: expect.stringContaining('quality'),
        inputSchema: expect.any(Object)
      }),
      expect.any(Function)
    )
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  })

  it('connects stdio transport', () => {
    expect(connect).toHaveBeenCalled()
  })

  it('logs startup to stderr', () => {
    expect(consoleError).toHaveBeenCalledWith('[ai-quality-gate] MCP Server started')
  })

  it('tool handler returns empty success for non-code files', async () => {
    const handler = registerTool.mock.calls[0]?.[2] as (args: { files: string[] }) => Promise<{
      content: { type: string; text: string }[]
    }>

    expect(typeof handler).toBe('function')

    const out = await handler({ files: ['note.md'] })
    const block = out.content[0]

    if (block === undefined) throw new Error('expected MCP text block')

    const payload = JSON.parse(block.text) as { success: boolean; message: string }

    expect(payload.success).toBe(true)
    expect(payload.message).toMatch(/No code files/)
  })
})
