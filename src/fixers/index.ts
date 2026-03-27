/**
 * Fixers Module Barrel Export
 *
 * Note: Removed fixers now handled elsewhere:
 * - ForEachToForOfFixer → unicorn/no-array-for-each (ESLint auto-fix)
 * - NestedTernaryFixer → unicorn/no-nested-ternary (ESLint auto-fix)
 * - FunctionToArrowFixer → Removed (utility functions should use named function declarations)
 */

export { BaseFixer } from './BaseFixer'
export { AutoFixer, autoFixer } from './AutoFixer'
export { CurlyBracesFixer } from './CurlyBracesFixer'
