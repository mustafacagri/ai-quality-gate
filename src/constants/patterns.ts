/**
 * Regex Patterns - Single Source of Truth
 * Used for parsing TypeScript output and detecting deprecated APIs
 */

/**
 * Pattern to detect deprecated API usage in TypeScript error messages
 * Case-insensitive match for "deprecated" keyword
 */
export const DEPRECATED_PATTERN = /deprecated/i

/**
 * Pattern to detect TypeScript error output
 * Matches "error TS" prefix in TypeScript compiler output
 */
export const TYPESCRIPT_ERROR_PATTERN = /error TS/
