import { CandidateProfile, JobSpec } from "@/types"

const BASE_TRUTH_GUARD_RULES = `
You are a truthful AI job matcher.
- Use only evidence present in the candidate profile text. If information is missing, state it as a gap.
- Never hallucinate employers, dates, metrics, or responsibilities.
- Highlight mismatches explicitly and prefer concise factual wording.
- Return a minified JSON object with the shape:
  {
    "fit_score": number (0-100, integer),
    "highlights": string[],
    "gaps": string[],
    "verdict": string
  }
- Each highlight or gap must be rooted in resume evidence or acknowledge the absence of evidence.
- Do not include any additional keys or commentary outside the JSON response.
`.trim()

export type RoleCategory = "uiux" | "frontend" | "backend" | "marketing" | "general"

const ROLE_PROMPTS: Record<RoleCategory, string> = {
  uiux: `
You are an HR analyst specialized in UI/UX design roles.
Score the candidate using these weighted criteria:
1) Mobile UI/UX delivery and product case studies (30%)
2) Design thinking process, research, and usability testing (20%)
3) Tools & software proficiency (Figma, Sketch, Adobe, prototyping) (20%)
4) Cross-functional collaboration & communication with engineering/product (15%)
5) Cultural and language fit for stakeholder work (15%)
`.trim(),
  frontend: `
You are an HR analyst specialized in frontend engineering roles.
Score the candidate using these weighted criteria:
1) Modern web frameworks and component architecture (30%)
2) Performance, accessibility, and testing practices (20%)
3) Tooling mastery (TypeScript, build systems, CI/CD) (20%)
4) Collaboration with design/product and communication (15%)
5) Cultural fit, documentation, and mentorship (15%)
`.trim(),
  backend: `
You are an HR analyst specialized in backend engineering roles.
Score the candidate using these weighted criteria:
1) Distributed systems, APIs, and data modeling (30%)
2) Reliability, scalability, and observability practices (20%)
3) Language & infrastructure proficiency (20%)
4) Collaboration with cross-functional teams (15%)
5) Security, compliance, and cultural fit (15%)
`.trim(),
  marketing: `
You are an HR analyst specialized in marketing and growth roles.
Score the candidate using these weighted criteria:
1) Campaign strategy and measurable outcomes (30%)
2) Channel expertise (paid, organic, lifecycle, partnerships) (20%)
3) Tooling & analytics proficiency (20%)
4) Cross-team collaboration and communication skills (15%)
5) Cultural fit and market/language alignment (15%)
`.trim(),
  general: `
You are an HR analyst assessing general professional roles.
Score the candidate using these weighted criteria:
1) Direct experience aligned to responsibilities (30%)
2) Process, methodology, and execution rigor (20%)
3) Tools & technical proficiencies (20%)
4) Collaboration, communication, and leadership (15%)
5) Cultural and language fit (15%)
`.trim(),
}

export const inferRoleCategory = (jobSpec: JobSpec): RoleCategory => {
  const corpus = [
    jobSpec.title,
    ...jobSpec.responsibilities,
    ...jobSpec.mustHaves,
    ...jobSpec.niceToHaves,
    ...jobSpec.keywords,
  ]
    .join(" ")
    .toLowerCase()

  if (/\b(ui|ux)\b/.test(corpus) || corpus.includes("product designer") || corpus.includes("design system")) {
    return "uiux"
  }

  if (corpus.includes("frontend") || corpus.includes("front-end") || corpus.includes("react") || corpus.includes("typescript")) {
    return "frontend"
  }

  if (corpus.includes("backend") || corpus.includes("back-end") || corpus.includes("api") || corpus.includes("microservice")) {
    return "backend"
  }

  if (corpus.includes("marketing") || corpus.includes("growth") || corpus.includes("seo") || corpus.includes("demand gen")) {
    return "marketing"
  }

  return "general"
}

export const buildMatchSystemPrompt = (role: RoleCategory): string =>
  [ROLE_PROMPTS[role], BASE_TRUTH_GUARD_RULES].join("\n\n")

type MatchUserContentParams = {
  jobSpec: JobSpec
  candidateProfile: CandidateProfile
  cleanedJobDescription: string
  cleanedResumeText: string
  role: RoleCategory
  jobKeywords: string[]
  resumeKeywords: string[]
}

export const buildMatchUserContent = ({
  jobSpec,
  candidateProfile,
  cleanedJobDescription,
  cleanedResumeText,
  role,
  jobKeywords,
  resumeKeywords,
}: MatchUserContentParams) =>
  JSON.stringify({
    target_role: jobSpec.title,
    role_category: role,
    job_spec: jobSpec,
    cleaned_job_description: cleanedJobDescription,
    candidate_profile: candidateProfile,
    cleaned_resume_text: cleanedResumeText,
    keyword_summary: {
      job_keywords: jobKeywords,
      resume_keywords: resumeKeywords,
    },
  })

export const buildRewriteSystemPrompt = (targetRole: string): string =>
  `
You are an ethical career assistant. Rewrite the candidate's resume truthfully but optimized for the target role "${targetRole}".
- Use natural language and resume section formatting (Contact, Experience, Skills, etc.).
- Emphasize demonstrated strengths and transferable achievements that align with the job description.
- Do NOT fabricate companies, dates, responsibilities, or metrics. If something is missing, focus on framing existing evidence.
- Keep the tone confident, specific, and results-oriented. Length should remain concise (roughly one page when rendered).
`.trim()

type RewriteUserContentParams = {
  targetRole: string
  cleanedJobDescription: string
  candidateProfile: CandidateProfile
  cleanedResumeText: string
  matchHighlights: string[]
  matchGaps: string[]
  matchVerdict: string
}

export const buildRewriteUserContent = ({
  targetRole,
  cleanedJobDescription,
  candidateProfile,
  cleanedResumeText,
  matchHighlights,
  matchGaps,
  matchVerdict,
}: RewriteUserContentParams) =>
  JSON.stringify({
    target_role: targetRole,
    cleaned_job_description: cleanedJobDescription,
    candidate_profile: candidateProfile,
    resume_evidence: cleanedResumeText,
    match_summary: {
      highlights: matchHighlights,
      gaps: matchGaps,
      verdict: matchVerdict,
    },
  })
