import { z } from "zod"

export const MatchOutputSchema = z.object({
  fit_score: z.number().min(0).max(100),
  highlights: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  verdict: z.string().trim(),
  llm_fit_score: z.number().min(0).max(100).optional(),
  keyword_overlap: z.number().min(0).max(100).optional(),
})

export type MatchOutput = z.infer<typeof MatchOutputSchema>
