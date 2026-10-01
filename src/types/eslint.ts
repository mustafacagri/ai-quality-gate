/** Validate the external ESLint JSON boundary before processing any findings. */
import { z } from 'zod'

const ESLintMessageSchema = z.object({
  ruleId: z.string().nullable(),
  severity: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  message: z.string(),
  line: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
  fatal: z.boolean().optional()
})
export const ESLintResultsSchema = z.array(
  z.object({
    filePath: z.string().min(1),
    messages: z.array(ESLintMessageSchema),
    output: z.string().optional()
  })
)
export type ESLintResult = z.infer<typeof ESLintResultsSchema>[number]
export type ESLintMessage = z.infer<typeof ESLintMessageSchema>
