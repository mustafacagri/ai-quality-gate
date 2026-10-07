/** The message of a caught value, which is not always an `Error`. */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))
