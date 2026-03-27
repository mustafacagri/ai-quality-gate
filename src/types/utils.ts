/**
 * Utility Types - Generic helper types
 */

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

export type Result<T, E = Error> = { success: false; error: E } | { success: true; data: T }
