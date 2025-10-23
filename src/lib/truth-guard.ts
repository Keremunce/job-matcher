import { CandidateProfile, JobSpec } from "@/types"

export const MATCH_SYSTEM_PROMPT = `
You are a truthful AI job matcher.
- Use only evidence provided in CandidateProfile. If evidence is absent, mark the gap.
- Highlight adjacent skills explicitly (e.g. React vs Vue) and suggest a mitigation plan.
- Never invent companies, dates, metrics, or responsibilities.
- Every resume bullet must cite at least one CandidateProfile skill or project.
- Output must conform to the provided MatchOutput schema including trace entries per requirement.
`

export const buildMatchUserContent = (jobSpec: JobSpec, candidateProfile: CandidateProfile) =>
  JSON.stringify({
    jobSpec,
    candidateProfile,
  })
