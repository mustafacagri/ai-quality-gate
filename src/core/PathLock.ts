/**
 * Two calls that edit the same file must not overlap. Each keeps a snapshot of the file from before its own edits,
 * so the one that rolls back later would put an older version over the other's committed edits.
 * Calls on different files do not wait for each other.
 */

export class PathLock {
  /** Per path, the point after which the path is free: everyone who asked before has finished. */
  private readonly tails = new Map<string, Promise<void>>()

  /**
   * Runs `task` once every call that asked earlier for any of `paths` has finished.
   *
   * All the paths are queued in one step, before anything is awaited, so calls are served in the order they asked.
   * A call only ever waits for calls that asked before it, which is why two calls that name the same paths in a
   * different order cannot wait on each other.
   */
  async run<T>(paths: readonly string[], task: () => Promise<T>): Promise<T> {
    const handle: { release?: () => void } = {}
    const finished = new Promise<void>(resolve => {
      handle.release = resolve
    })
    const queued = [...new Set(paths)].map(key => {
      const before = this.tails.get(key) ?? Promise.resolve()
      const tail = before.then(() => finished)

      this.tails.set(key, tail)

      return { key, before, tail }
    })

    try {
      await Promise.all(queued.map(({ before }) => before))

      return await task()
    } finally {
      handle.release?.()

      for (const { key, tail } of queued) {
        if (this.tails.get(key) === tail) this.tails.delete(key)
      }
    }
  }
}
