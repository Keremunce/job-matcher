import { z } from "zod"

import { CandidateProfileSchema } from "./core"
import { MatchOutputSchema } from "./match"
import { RewriteResumeSchema } from "./rewrite"

export const ExportPdfSchema = z.object({
  candidateProfile: CandidateProfileSchema,
  matchOutput: MatchOutputSchema,
  optimizedResume: RewriteResumeSchema,
})

export type ExportPdfPayload = z.infer<typeof ExportPdfSchema>
