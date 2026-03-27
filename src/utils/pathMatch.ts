/**
 * Path matching for tool output paths vs requested file lists (cross-platform).
 */

import path from 'node:path'

/**
 * Whether `filePath` refers to the same file as one of `relevantFiles`, allowing
 * relative/absolute suffix mismatches common in compiler output.
 */
export const isFileRelevantToPaths = (filePath: string, relevantFiles: string[]): boolean => {
  const normalizedFile = path.normalize(filePath)

  return relevantFiles.some(f => {
    const normalizedF = path.normalize(f)

    if (process.platform === 'win32') {
      const fLower = normalizedF.toLowerCase()
      const fileLower = normalizedFile.toLowerCase()

      return fLower.endsWith(fileLower) || fileLower.endsWith(fLower)
    }

    return normalizedF.endsWith(normalizedFile) || normalizedFile.endsWith(normalizedF)
  })
}
