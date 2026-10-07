import { describe, expect, it } from 'vitest'

import { PathLock } from '@/core/PathLock'

/** A promise that is settled from outside, so a test decides when a task ends. */
const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  const handle: { settle?: () => void } = {}
  const promise = new Promise<void>(resolve => {
    handle.settle = resolve
  })

  return { promise, resolve: () => handle.settle?.() }
}

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setImmediate(resolve)
  })

describe('PathLock', () => {
  it('runs calls that share a path one after the other, in the order they asked', async () => {
    const lock = new PathLock()
    const events: string[] = []
    const first = deferred()
    const second = deferred()

    const a = lock.run(['/a'], async () => {
      events.push('a start')
      await first.promise
      events.push('a end')
    })
    const b = lock.run(['/a'], async () => {
      events.push('b start')
      await second.promise
      events.push('b end')
    })

    await tick()
    expect(events).toEqual(['a start'])

    first.resolve()
    await tick()
    expect(events).toEqual(['a start', 'a end', 'b start'])

    second.resolve()
    await Promise.all([a, b])
    expect(events).toEqual(['a start', 'a end', 'b start', 'b end'])
  })

  it('lets calls on different paths run together', async () => {
    const lock = new PathLock()
    const events: string[] = []
    const release = deferred()

    const a = lock.run(['/a'], async () => {
      events.push('a start')
      await release.promise
      events.push('a end')
    })
    const b = lock.run(['/b'], () => {
      events.push('b ran')

      return Promise.resolve()
    })

    await b
    expect(events).toEqual(['a start', 'b ran'])

    release.resolve()
    await a
  })

  it('waits for every path of a call that shares only one of them', async () => {
    const lock = new PathLock()
    const events: string[] = []
    const release = deferred()

    const a = lock.run(['/a', '/b'], async () => {
      events.push('a start')
      await release.promise
      events.push('a end')
    })
    const b = lock.run(['/b', '/c'], () => {
      events.push('b ran')

      return Promise.resolve()
    })

    await tick()
    expect(events).toEqual(['a start'])

    release.resolve()
    await Promise.all([a, b])
    expect(events).toEqual(['a start', 'a end', 'b ran'])
  })

  it('does not deadlock when two calls ask for the same paths in opposite order', async () => {
    const lock = new PathLock()
    const done: string[] = []

    await Promise.all([
      lock.run(['/a', '/b'], () => Promise.resolve(done.push('ab'))),
      lock.run(['/b', '/a'], () => Promise.resolve(done.push('ba'))),
      lock.run(['/b', '/a', '/b'], () => Promise.resolve(done.push('bab')))
    ])

    expect([...done].sort((left, right) => left.localeCompare(right))).toEqual(['ab', 'ba', 'bab'])
  })

  it('frees the paths when the task throws, and passes the error on', async () => {
    const lock = new PathLock()

    await expect(lock.run(['/a'], () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    await expect(lock.run(['/a'], () => Promise.resolve('next'))).resolves.toBe('next')
  })

  it('returns what the task returns', async () => {
    await expect(new PathLock().run(['/a'], () => Promise.resolve(42))).resolves.toBe(42)
  })

  it('keeps nothing once every call is done', async () => {
    const lock = new PathLock()

    await Promise.all([lock.run(['/a', '/b'], () => Promise.resolve()), lock.run(['/a'], () => Promise.resolve())])

    expect(Reflect.get(lock, 'tails')).toHaveProperty('size', 0)
  })

  it('runs a call with no paths at once', async () => {
    await expect(new PathLock().run([], () => Promise.resolve('ok'))).resolves.toBe('ok')
  })
})
