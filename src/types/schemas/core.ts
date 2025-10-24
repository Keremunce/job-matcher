import { z } from "zod"

export const ContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  linkedin: z.string().url().optional(),
  portfolio: z.string().url().optional(),
  website: z.string().url().optional(),
  behance: z.string().url().optional(),
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

export const MatchPayloadSchema = z.object({
  jobSpecRaw: z.unknown(),
  candidateProfileRaw: z.unknown(),
})
