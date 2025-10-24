import { CandidateProfile, JobSpec } from "@/types"

export function sanitizeProjectTitle(s: string) {
  const withoutParens = s.replace(/\s*\([^)]*\)\s*/g, " ")

  const normalizedSeparators = withoutParens.replace(/[-–—|•]+/g, (match, offset, str) => {
    const index = typeof offset === "number" ? offset : 0
    const source = typeof str === "string" ? str : withoutParens
    const prev = index > 0 ? source[index - 1] : " "
    const next = index + match.length < source.length ? source[index + match.length] : " "
    const prevIsSpace = /\s/.test(prev)
    const nextIsSpace = /\s/.test(next)

    if (!prevIsSpace && !nextIsSpace) {
      return "-"
    }

    return " - "
  })

  return normalizedSeparators.replace(/\s{2,}/g, " ").trim()
}

export function dedupeLines(s: string) {
  const seen = new Set<string>()
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !seen.has(l) && (seen.add(l), true))
    .join("\n")
}

export function stripNameFromSummary(summary: string, fullName: string) {
  const n = fullName.trim().replace(/\s+/g, "\\s+")
  if (!n) return summary.trim()
  const re = new RegExp(`\\b${n}\\b`, "i")
  return summary.replace(re, "").replace(/\s{2,}/g, " ").trim()
}

export function composeContact(c: {
  email?: string
  phone?: string
  linkedin?: string
  website?: string
  behance?: string
  location?: string
}) {
  const parts = [c.email, c.phone, c.linkedin, c.website, c.behance].filter(Boolean)
  const line = parts.join(" | ")
  return c.location ? { top: line, bottom: c.location } : { top: line, bottom: "" }
}

export function asciiSafe(s: string) {
  return s
    .replace(/[•–—│]/g, "-")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

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
    website: profile.contact.website?.trim(),
    behance: profile.contact.behance?.trim(),
  },
  title: profile.title?.trim(),
  location: profile.location?.trim(),
  skills: trimList(profile.skills),
  tools: trimList(profile.tools),
  projects: profile.projects.map((project) => ({
    ...project,
    name: sanitizeProjectTitle(project.name?.trim() || "Untitled Project"),
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
