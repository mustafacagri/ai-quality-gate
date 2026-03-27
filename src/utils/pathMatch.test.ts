import { describe, expect, it } from 'vitest'

import { isFileRelevantToPaths } from '@/utils/pathMatch'

const withPlatform = <T>(platform: NodeJS.Platform, fn: () => T): T => {
  const original = process.platform

  Object.defineProperty(process, 'platform', { value: platform })

  try {
    return fn()
  } finally {
    Object.defineProperty(process, 'platform', { value: original })
  }
}

describe('isFileRelevantToPaths', () => {
  it('matches identical normalized paths on posix', () =>
    withPlatform('darwin', () => expect(isFileRelevantToPaths('/proj/src/a.ts', ['/proj/src/a.ts'])).toBe(true)))

  it('matches when one path is a suffix of the other (posix)', () =>
    withPlatform('linux', () => expect(isFileRelevantToPaths('src/a.ts', ['/abs/proj/src/a.ts'])).toBe(true)))

  it('on win32 compares case-insensitive suffixes', () =>
    withPlatform('win32', () => expect(isFileRelevantToPaths('src/app.ts', ['C:/Proj/src/app.ts'])).toBe(true)))

  it('on win32 matches Sonar-style relative paths with backslashes against absolute files', () => {
    withPlatform('win32', () =>
      expect(isFileRelevantToPaths(String.raw`src\sub\app.ts`, [String.raw`C:\Proj\src\sub\app.ts`])).toBe(true)
    )
  })
})
