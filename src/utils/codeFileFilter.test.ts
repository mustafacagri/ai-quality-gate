import { describe, expect, it } from 'vitest'

import { filterCodeFiles } from '@/utils/codeFileFilter'

describe('filterCodeFiles', () => {
  it('places .ts, .js, .tsx, .jsx, and .vue paths in codeFiles', () => {
    const input = ['src/a.ts', 'lib/b.js', 'ui/C.tsx', 'app/D.jsx', 'components/Widget.vue']
    const { codeFiles, skippedFiles } = filterCodeFiles(input)

    expect(codeFiles).toEqual(expect.arrayContaining(input))
    expect(codeFiles).toHaveLength(input.length)
    expect(skippedFiles).toHaveLength(0)
  })

  it('places .md, .json, and .yaml paths in skippedFiles', () => {
    const input = ['README.md', 'cfg.json', 'docker-compose.yaml']
    const { codeFiles, skippedFiles } = filterCodeFiles(input)

    expect(skippedFiles).toEqual(expect.arrayContaining(input))
    expect(skippedFiles).toHaveLength(input.length)
    expect(codeFiles).toHaveLength(0)
  })

  it('is case-insensitive for extensions', () => {
    const { codeFiles, skippedFiles } = filterCodeFiles([
      'x.TS',
      'y.JS',
      'z.TSX',
      'w.JSX',
      'doc.MD',
      'data.JSON',
      'stack.YAML'
    ])

    expect(codeFiles).toEqual(expect.arrayContaining(['x.TS', 'y.JS', 'z.TSX', 'w.JSX']))
    expect(skippedFiles).toEqual(expect.arrayContaining(['doc.MD', 'data.JSON', 'stack.YAML']))
  })
})
