/**
 * Sync fs surface used by {@link TransactionManager}.
 * Plain object so Vitest can replace methods in ESM (node:fs namespace is not configurable).
 */
import * as fs from 'node:fs'

export const transactionFileSync = {
  readFileSync: fs.readFileSync.bind(fs),
  writeFileSync: fs.writeFileSync.bind(fs),
  existsSync: fs.existsSync.bind(fs),
  unlinkSync: fs.unlinkSync.bind(fs)
}
