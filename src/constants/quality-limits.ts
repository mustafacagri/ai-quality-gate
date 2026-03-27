/**
 * Code Quality Limits - Single Source of Truth
 * Reference: Clean Code, Google Style Guide, SonarQube defaults
 *
 * These limits are enforced by ESLint rules in Phase 1.
 * Same values should be kept in sync with:
 * - rules.json (ESLint config)
 * - Shared CODE_QUALITY_LIMITS (if used)
 */

// ═══════════════════════════════════════════════════════════════════════════
// File-Level Limits
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 📁 File-Level Quality Limits
 */
export const FILE_LIMITS = {
  /** Maximum lines per file (excluding blank lines and comments) */
  MAX_LINES: 400,
  /** Maximum number of functions/methods per file */
  MAX_FUNCTIONS: 15,
  /** Maximum number of import statements per file */
  MAX_IMPORTS: 20,
  /** Maximum number of exported members per file */
  MAX_EXPORTS: 15
} as const

// ═══════════════════════════════════════════════════════════════════════════
// Function-Level Limits
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔧 Function-Level Quality Limits
 */
export const FUNCTION_LIMITS = {
  /** Maximum lines per function (excluding blank lines and comments) */
  MAX_LINES: 50,
  /** Maximum number of parameters */
  MAX_PARAMETERS: 5,
  /** Maximum nesting depth (if/for/while/switch) */
  MAX_NESTING_DEPTH: 4,
  /** Maximum number of statements in a function */
  MAX_STATEMENTS: 20,
  /** Maximum cognitive complexity (SonarQube metric) */
  COGNITIVE_COMPLEXITY: 15,
  /** Maximum cyclomatic complexity */
  CYCLOMATIC_COMPLEXITY: 10,
  /** Maximum nested callbacks (callback hell) */
  MAX_NESTED_CALLBACKS: 3
} as const

// ═══════════════════════════════════════════════════════════════════════════
// Class-Level Limits
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 📦 Class-Level Quality Limits
 */
export const CLASS_LIMITS = {
  /** Maximum lines per class */
  MAX_LINES: 300,
  /** Maximum methods per class */
  MAX_METHODS: 15,
  /** Maximum fields/properties per class */
  MAX_FIELDS: 15
} as const

// ═══════════════════════════════════════════════════════════════════════════
// Duplication Limits
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔄 Duplication Limits
 */
export const DUPLICATION_LIMITS = {
  /** Maximum times a string can be duplicated */
  MAX_DUPLICATE_STRING: 4,
  /** Minimum lines for duplicate block detection */
  MIN_DUPLICATE_BLOCK_LINES: 10
} as const

// ═══════════════════════════════════════════════════════════════════════════
// Combined Configuration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🎯 Combined Quality Configuration
 * Use this for easy access to all limits
 */
export const CODE_QUALITY_LIMITS = {
  FILE: FILE_LIMITS,
  FUNCTION: FUNCTION_LIMITS,
  CLASS: CLASS_LIMITS,
  DUPLICATION: DUPLICATION_LIMITS
} as const

export type CodeQualityLimits = typeof CODE_QUALITY_LIMITS
