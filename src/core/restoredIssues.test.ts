import { describe, expect, it } from 'vitest'

import { selectIssuesOnRestoredFiles } from '@/core/restoredIssues'
import type { Issue } from '@/types'

const issue = (file: string, line: number, message: string, rule = 'eslint'): Issue => ({
  rule,
  file,
  line,
  message,
  severity: 'error'
})

describe('selectIssuesOnRestoredFiles', () => {
  it('takes locations from the restored files', () => {
    const result = selectIssuesOnRestoredFiles([issue('a.ts', 10, 'bad')], [issue('a.ts', 2, 'bad')])

    expect(result).toEqual([issue('a.ts', 2, 'bad')])
  })

  it('drops findings only the restored files have, because an auto-fix removes them', () => {
    const result = selectIssuesOnRestoredFiles([], [issue('a.ts', 1, 'prefer const')])

    expect(result).toEqual([])
  })

  it('locates every occurrence when the counts match', () => {
    const rejected = [issue('a.ts', 8, 'console'), issue('a.ts', 9, 'console')]
    const restored = [issue('a.ts', 1, 'console'), issue('a.ts', 2, 'console')]

    expect(selectIssuesOnRestoredFiles(rejected, restored).map(found => found.line)).toEqual([1, 2])
  })

  it('does not guess which occurrence survived when the restored files have more of them', () => {
    const rejected = [issue('a.ts', 3, 'loose equality')]
    const restored = [issue('a.ts', 2, 'loose equality'), issue('a.ts', 3, 'loose equality')]

    expect(selectIssuesOnRestoredFiles(rejected, restored)).toEqual([issue('a.ts', 0, 'loose equality')])
  })

  it('reports every rejected issue without a location when the restored files have fewer of them', () => {
    const rejected = [issue('a.ts', 8, 'console'), issue('a.ts', 9, 'console')]
    const restored = [issue('a.ts', 1, 'console')]

    expect(selectIssuesOnRestoredFiles(rejected, restored)).toEqual([
      issue('a.ts', 0, 'console'),
      issue('a.ts', 0, 'console')
    ])
  })

  it('does not match an identical message in another file or rule', () => {
    const rejected = [issue('a.ts', 4, 'bad')]
    const restored = [issue('b.ts', 1, 'bad'), issue('a.ts', 2, 'bad', 'typescript')]

    expect(selectIssuesOnRestoredFiles(rejected, restored)).toEqual([issue('a.ts', 0, 'bad')])
  })

  it('lists located issues first and unlocated ones after them, and never loses a rejected issue', () => {
    const rejected = [issue('a.ts', 5, 'only rejected'), issue('a.ts', 6, 'both')]
    const restored = [issue('a.ts', 3, 'both')]
    const result = selectIssuesOnRestoredFiles(rejected, restored)

    expect(result).toEqual([issue('a.ts', 3, 'both'), issue('a.ts', 0, 'only rejected')])
    expect(result).toHaveLength(rejected.length)
  })

  it('drops the column of an issue it cannot locate', () => {
    const result = selectIssuesOnRestoredFiles([{ ...issue('a.ts', 7, 'bad'), column: 4 }], [])

    expect(result[0]).not.toHaveProperty('column')
  })
})
