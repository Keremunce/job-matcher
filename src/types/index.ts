import { z } from "zod"

export const ContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  linkedin: z.string().url().optional(),
  portfolio: z.string().url().optional(),
})

export const JobSpecSchema = z.object({
  title: z.string().trim().min(1, "Job title is required."),
  responsibilities: z.array(z.string().trim()).default([]),
  mustHaves: z.array(z.string().trim()).default([]),
  niceToHaves: z.array(z.string().trim()).default([]),
  keywords: z.array(z.string().trim()).default([]),
  location: z.string().optional(),
  employmentType: z.string().optional(),
})
export type JobSpec = z.infer<typeof JobSpecSchema>

export const CandidateProjectSchema = z.object({
  name: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  skills: z.array(z.string().trim()).default([]),
  outcomes: z.array(z.string().trim()).default([]),
})

export const CandidateProfileSchema = z.object({
  contact: ContactSchema,
  title: z.string().optional(),
  years: z.number().optional(),
  location: z.string().optional(),
  skills: z.array(z.string().trim()).default([]),
  tools: z.array(z.string().trim()).default([]),
  projects: z.array(CandidateProjectSchema).default([]),
  additionalContext: z.string().trim().optional(),
})
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>

export const MatchOutputSchema = z.object({
  fit_score: z.number().min(0).max(100),
  highlights: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  verdict: z.string().trim(),
  llm_fit_score: z.number().min(0).max(100).optional(),
  keyword_overlap: z.number().min(0).max(100).optional(),
})
export type MatchOutput = z.infer<typeof MatchOutputSchema>

export const MatchPayloadSchema = z.object({
  jobSpecRaw: z.unknown(),
  candidateProfileRaw: z.unknown(),
})

export const ExportPdfSchema = z.object({
  candidateProfile: CandidateProfileSchema,
  matchOutput: MatchOutputSchema,
})

export type ExportPdfPayload = z.infer<typeof ExportPdfSchema>
