import { z } from "zod"

export const RewriteContactSchema = z.object({
  name: z.string().trim(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  linkedin: z.string().trim().optional(),
  website: z.string().trim().optional(),
  behance: z.string().trim().optional(),
  location: z.string().trim().optional(),
})

export const RewriteExperienceSchema = z.object({
  company: z.string().trim(),
  role: z.string().trim(),
  dates: z.string().trim().optional(),
  bullets: z.array(z.string().trim()).optional(),
})

export const RewriteProjectSchema = z.object({
  title: z.string().trim(),
  bullets: z.array(z.string().trim()).optional(),
})

export const RewriteEducationSchema = z.object({
  school: z.string().trim(),
  degree: z.string().trim().optional(),
  dates: z.string().trim().optional(),
})

export const RewriteResumeSchema = z.object({
  contact: RewriteContactSchema,
  headline: z.string().trim(),
  summary: z.string().trim(),
  skills: z.array(z.string().trim()).optional(),
  experience: z.array(RewriteExperienceSchema).optional(),
  projects: z.array(RewriteProjectSchema).optional(),
  education: z.array(RewriteEducationSchema).optional(),
})

export type RewriteContact = z.infer<typeof RewriteContactSchema>
export type RewriteExperience = z.infer<typeof RewriteExperienceSchema>
export type RewriteProject = z.infer<typeof RewriteProjectSchema>
export type RewriteEducation = z.infer<typeof RewriteEducationSchema>
export type RewriteResume = z.infer<typeof RewriteResumeSchema>
