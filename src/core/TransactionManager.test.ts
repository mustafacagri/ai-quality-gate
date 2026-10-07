import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { RollbackError, TransactionManager } from '@/core/TransactionManager'
import { transactionFileSync } from '@/core/transactionFileSync'

const makeTempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-tx-'))

describe('TransactionManager', () => {
  it('begin returns a transaction that can commit', async () => {
    const manager = new TransactionManager()
    const tx = manager.begin()

    await expect(tx.commit()).resolves.toBeUndefined()
    await expect(tx.commit()).rejects.toThrow(/already committed/)
  })

  it('rollback restores original file content', async () => {
    const dir = makeTempDir()

    const file = path.join(dir, 'sample.txt')

    fs.writeFileSync(file, 'original', 'utf8')

    const manager = new TransactionManager()
    const tx = manager.begin()

    tx.recordChange(file)
    fs.writeFileSync(file, 'modified', 'utf8')

    await tx.rollback()

    expect(fs.readFileSync(file, 'utf8')).toBe('original')
  })

  it('rollback removes file that was created during transaction', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'new.txt')

    const manager = new TransactionManager()
    const tx = manager.begin()

    tx.recordChange(file)
    fs.writeFileSync(file, 'hello', 'utf8')

    await tx.rollback()

    expect(fs.existsSync(file)).toBe(false)
  })

  it('rejects rollback after commit', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'a.txt')

    fs.writeFileSync(file, 'x', 'utf8')

    const manager = new TransactionManager()
    const tx = manager.begin()

    tx.recordChange(file)
    await tx.commit()

    await expect(tx.rollback()).rejects.toThrow(/already committed/)
  })

  it('does not duplicate backup when recordChange is called twice for the same file', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'idempotent.txt')

    fs.writeFileSync(file, 'v1', 'utf8')

    const manager = new TransactionManager()
    const tx = manager.begin()

    tx.recordChange(file)
    fs.writeFileSync(file, 'v2', 'utf8')
    tx.recordChange(file)
    fs.writeFileSync(file, 'v3', 'utf8')

    await tx.rollback()

    expect(fs.readFileSync(file, 'utf8')).toBe('v1')
  })

  it('rejects commit after rollback', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'after-rb.txt')

    fs.writeFileSync(file, 'orig', 'utf8')

    const tx = new TransactionManager().begin()

    tx.recordChange(file)
    fs.writeFileSync(file, 'chg', 'utf8')
    await tx.rollback()

    await expect(tx.commit()).rejects.toThrow(/already rolled back/)
  })

  it('rejects commit when transaction was already rolled back before commit attempt', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'commit-after-rb2.txt')

    fs.writeFileSync(file, '0', 'utf8')
    const tx = new TransactionManager().begin()

    tx.recordChange(file)
    await tx.rollback()

    await expect(tx.commit()).rejects.toThrow(/already rolled back/)
  })

  it('rejects recordChange after rollback', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'rc-after-rb.txt')

    fs.writeFileSync(file, 'z', 'utf8')

    const tx = new TransactionManager().begin()

    tx.recordChange(file)
    await tx.rollback()

    expect(() => tx.recordChange(file)).toThrow(/finalized/)
  })

  it('rejects rollback that partially fails when restore throws', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'restore-write-fail.txt')

    fs.writeFileSync(file, 'keep', 'utf8')

    const tx = new TransactionManager().begin()

    tx.recordChange(file)
    fs.writeFileSync(file, 'mutated', 'utf8')

    const writeImpl = transactionFileSync.writeFileSync.bind(transactionFileSync)
    const spy = vi
      .spyOn(transactionFileSync, 'writeFileSync')
      .mockImplementation((...args: Parameters<typeof transactionFileSync.writeFileSync>) => {
        const pathLike = args[0]

        if (typeof pathLike === 'string' && path.resolve(pathLike) === path.resolve(file)) {
          throw new Error('simulated write failure')
        }

        writeImpl(...args)
      })

    await expect(tx.rollback()).rejects.toThrow(/Rollback partially failed/)

    spy.mockRestore()
  })

  it('names the files it could not restore and the ones it did', async () => {
    const dir = makeTempDir()
    const stuck = path.join(dir, 'stuck.txt')
    const fine = path.join(dir, 'fine.txt')

    fs.writeFileSync(stuck, 'keep', 'utf8')
    fs.writeFileSync(fine, 'keep', 'utf8')

    const tx = new TransactionManager().begin()

    tx.recordChange(stuck)
    tx.recordChange(fine)
    fs.writeFileSync(stuck, 'mutated', 'utf8')
    fs.writeFileSync(fine, 'mutated', 'utf8')

    const writeImpl = transactionFileSync.writeFileSync.bind(transactionFileSync)
    const spy = vi
      .spyOn(transactionFileSync, 'writeFileSync')
      .mockImplementation((...args: Parameters<typeof transactionFileSync.writeFileSync>) => {
        const pathLike = args[0]

        if (typeof pathLike === 'string' && path.resolve(pathLike) === path.resolve(stuck)) {
          throw new Error('simulated write failure')
        }

        writeImpl(...args)
      })

    const error: unknown = await tx.rollback().then(
      () => undefined,
      (error_: unknown) => error_
    )

    spy.mockRestore()

    expect(error).toBeInstanceOf(RollbackError)
    expect((error as RollbackError).failures).toEqual([{ file: stuck, message: 'simulated write failure' }])
    expect((error as RollbackError).restored).toEqual([fine])
    expect(fs.readFileSync(fine, 'utf8')).toBe('keep')
    expect(fs.readFileSync(stuck, 'utf8')).toBe('mutated')
  })

  it('rejects rollback when unlink throws for a created file', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'rollback-unlink-fail.txt')

    const tx = new TransactionManager().begin()

    tx.recordChange(file)
    fs.writeFileSync(file, 'created', 'utf8')

    const unlinkImpl = transactionFileSync.unlinkSync.bind(transactionFileSync)
    const spy = vi
      .spyOn(transactionFileSync, 'unlinkSync')
      .mockImplementation((...args: Parameters<typeof transactionFileSync.unlinkSync>) => {
        const pathLike = args[0]

        if (typeof pathLike === 'string' && path.resolve(pathLike) === path.resolve(file)) {
          throw new Error('simulated unlink failure')
        }

        unlinkImpl(...args)
      })

    await expect(tx.rollback()).rejects.toThrow(/Rollback partially failed/)

    spy.mockRestore()
  })

  it('rejects rollback after successful rollback', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'rb.txt')

    fs.writeFileSync(file, 'orig', 'utf8')

    const tx = new TransactionManager().begin()

    tx.recordChange(file)
    fs.writeFileSync(file, 'chg', 'utf8')
    await tx.rollback()

    await expect(tx.rollback()).rejects.toThrow(/already rolled back/)
  })

  it('rejects recordChange after commit', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'post.txt')

    fs.writeFileSync(file, 'a', 'utf8')

    const tx = new TransactionManager().begin()

    tx.recordChange(file)
    await tx.commit()

    expect(() => tx.recordChange(file)).toThrow(/Transaction already finalized/)
  })

  it('supports independent sequential transactions from the same manager', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'seq.txt')

    fs.writeFileSync(file, '0', 'utf8')

    const manager = new TransactionManager()

    const tx1 = manager.begin()

    tx1.recordChange(file)
    fs.writeFileSync(file, '1', 'utf8')
    await tx1.commit()

    const tx2 = manager.begin()

    tx2.recordChange(file)
    fs.writeFileSync(file, '2', 'utf8')
    await tx2.rollback()

    expect(fs.readFileSync(file, 'utf8')).toBe('1')
  })

  it('rollback restores an existing empty file instead of deleting it', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'empty.txt')

    fs.writeFileSync(file, '', 'utf8')

    const tx = new TransactionManager().begin()

    tx.recordChange(file)
    fs.writeFileSync(file, 'changed', 'utf8')
    await tx.rollback()

    expect(fs.existsSync(file)).toBe(true)
    expect(fs.readFileSync(file, 'utf8')).toBe('')
  })

  it('rethrows snapshot read errors that are not a missing file', () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'denied.txt')

    fs.writeFileSync(file, 'x', 'utf8')

    const tx = new TransactionManager().begin()
    const spy = vi.spyOn(transactionFileSync, 'readFileSync').mockImplementation(() => {
      throw Object.assign(new Error('denied'), { code: 'EACCES' })
    })

    expect(() => tx.recordChange(file)).toThrow(/denied/)

    spy.mockRestore()
  })
})
