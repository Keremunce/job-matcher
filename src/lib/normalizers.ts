import { CandidateProfile, JobSpec } from "@/types"

const bulletRegex = /[•·◦▪►■◆▶▸-]\s*/g
const whitespaceRegex = /\s+/g
const disallowedCharsRegex = /[^a-zA-Z0-9.,;:/()&\-'\s]/g

const trimList = (values: string[] | undefined) =>
  Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)))

export const cleanResumeText = (text: string): string =>
  text
    .replace(bulletRegex, "- ")
    .replace(disallowedCharsRegex, "")
    .replace(whitespaceRegex, " ")
    .trim()

export const cleanJobDescription = (text: string): string =>
  text
    .replace(/(What we offer|Benefits|Compensation)[\s\S]*/i, "")
    .replace(bulletRegex, "- ")
    .replace(disallowedCharsRegex, "")
    .replace(whitespaceRegex, " ")
    .trim()

export const normalizeJobSpec = (spec: JobSpec): JobSpec => ({
  ...spec,
  title: spec.title.trim(),
  responsibilities: trimList(spec.responsibilities),
  mustHaves: trimList(spec.mustHaves),
  niceToHaves: trimList(spec.niceToHaves),
  keywords: trimList(spec.keywords),
  location: spec.location?.trim() || undefined,
  employmentType: spec.employmentType?.trim() || undefined,
})

export const normalizeCandidateProfile = (profile: CandidateProfile): CandidateProfile => ({
  ...profile,
  contact: {
    ...profile.contact,
    name: profile.contact.name?.trim() || "Candidate",
    email: profile.contact.email?.trim(),
    phone: profile.contact.phone?.trim(),
    linkedin: profile.contact.linkedin?.trim(),
    portfolio: profile.contact.portfolio?.trim(),
  },
  title: profile.title?.trim(),
  location: profile.location?.trim(),
  skills: trimList(profile.skills),
  tools: trimList(profile.tools),
  projects: profile.projects.map((project) => ({
    ...project,
    name: project.name?.trim() || "Untitled Project",
    summary: project.summary?.trim() || "",
    skills: trimList(project.skills),
    outcomes: trimList(project.outcomes),
  })),
  additionalContext: profile.additionalContext?.trim() || undefined,
})

export const collectEvidenceStrings = (profile: CandidateProfile): string[] => {
  const projectSkills = profile.projects.flatMap((project) => project.skills)
  const projectOutcomes = profile.projects.flatMap((project) => project.outcomes)

  const entries: Array<string | undefined> = [
    profile.contact.name,
    profile.title ?? "",
    profile.additionalContext ?? "",
    ...profile.skills,
    ...profile.tools,
    ...projectSkills,
    ...projectOutcomes,
  ]

  return entries.filter((item): item is string => typeof item === "string" && item.length > 0)
}
