import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import type { CandidateProfile, JobSpec, MatchOutput } from "@/types"
import { CandidateProfileSchema, JobSpecSchema, MatchPayloadSchema } from "@/types/schemas/core"
import { MatchOutputSchema } from "@/types/schemas/match"
import {
  cleanJobDescription,
  cleanResumeText,
  collectEvidenceStrings,
  normalizeCandidateProfile,
  normalizeJobSpec,
} from "@/lib/normalizers"
import { buildMatchSystemPrompt, buildMatchUserContent, inferRoleCategory } from "@/lib/truth-guard"

const STOP_WORDS = new Set([
  "and",
  "or",
  "the",
  "a",
  "an",
  "for",
  "with",
  "from",
  "that",
  "this",
  "your",
  "our",
  "their",
  "to",
  "of",
  "in",
  "on",
  "by",
  "is",
  "are",
  "be",
  "as",
  "at",
  "we",
  "you",
  "will",
  "can",
  "able",
  "have",
  "has",
  "into",
  "within",
  "across",
  "about",
  "its",
  "it's",
])

const tokenize = (text: string): string[] =>
  (text.toLowerCase().match(/[a-z0-9+]+/g) ?? []).filter((token) => token.length > 2 && !STOP_WORDS.has(token))

const extractTopKeywords = (text: string, limit = 25): string[] => {
  const counts = new Map<string, number>()
  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token)
}

const computeKeywordStats = (jobKeywords: string[], resumeKeywords: string[]) => {
  if (jobKeywords.length === 0) {
    return { overlapTerms: [] as string[], overlapCount: 0, keywordScore: 0, percent: 0 }
  }

  const jobSet = new Set(jobKeywords)
  const resumeSet = new Set(resumeKeywords)
  const overlapTerms = [...jobSet].filter((keyword) => resumeSet.has(keyword))
  const overlapCount = overlapTerms.length
  const percent = Math.round(Math.min(100, (overlapCount / jobSet.size) * 100))
  const keywordScore = Math.min(100, (overlapCount / Math.max(10, jobSet.size)) * 120)
  return { overlapTerms, overlapCount, keywordScore, percent }
}

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

const buildMockResponse = (job: JobSpec, profile: CandidateProfile): MatchOutput => {
  const combinedJob = cleanJobDescription(
    [job.title, ...job.responsibilities, ...job.mustHaves, ...job.niceToHaves, ...job.keywords].join(" "),
  )
  const resumeText = cleanResumeText(
    [
      profile.contact.name,
      profile.title,
      profile.additionalContext,
      ...profile.skills,
      ...profile.tools,
      ...profile.projects.flatMap((project) => [project.name, project.summary, ...project.skills, ...project.outcomes]),
    ]
      .filter(Boolean)
      .join(" "),
  )

  const jobKeywords = extractTopKeywords(combinedJob)
  const resumeKeywords = extractTopKeywords(resumeText)
  const { keywordScore } = computeKeywordStats(jobKeywords, resumeKeywords)

  const verdict =
    keywordScore > 70
      ? "Likely qualified with strong alignment."
      : keywordScore > 40
        ? "Partially qualified; additional evidence would help."
        : "Limited evidence of fit for the role."

  return {
    fit_score: clampScore(keywordScore),
    highlights: resumeKeywords.slice(0, 3).map((keyword) => `Resume references ${keyword}.`),
    gaps: jobKeywords
      .filter((keyword) => !resumeKeywords.includes(keyword))
      .slice(0, 3)
      .map((keyword) => `No direct mention of ${keyword}.`),
    verdict,
    llm_fit_score: clampScore(keywordScore),
    keyword_overlap: Math.round(keywordScore),
  }
}

export async function POST(req: NextRequest) {
  let normalizedJob: JobSpec | null = null
  let normalizedProfile: CandidateProfile | null = null

  try {
    const json = await req.json().catch(() => null)
    if (!json) {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 })
    }

    const payloadResult = MatchPayloadSchema.safeParse(json)
    if (!payloadResult.success) {
      return NextResponse.json(
        { error: "Invalid request body.", details: payloadResult.error.format() },
        { status: 400 },
      )
    }

    const jobSpecResult = JobSpecSchema.safeParse(payloadResult.data.jobSpecRaw)
    const profileResult = CandidateProfileSchema.safeParse(payloadResult.data.candidateProfileRaw)

    if (!jobSpecResult.success || !profileResult.success) {
      return NextResponse.json(
        { error: "Invalid schema", details: { job: jobSpecResult.error?.format(), profile: profileResult.error?.format() } },
        { status: 422 },
      )
    }

    normalizedJob = normalizeJobSpec(jobSpecResult.data)
    normalizedProfile = normalizeCandidateProfile(profileResult.data)

    const combinedJob = cleanJobDescription(
      [
        normalizedJob.title,
        ...normalizedJob.responsibilities,
        ...normalizedJob.mustHaves,
        ...normalizedJob.niceToHaves,
        ...normalizedJob.keywords,
      ].join(" "),
    )

    const resumeEvidence = cleanResumeText(
      [
        normalizedProfile.contact.name,
        normalizedProfile.title,
        normalizedProfile.location,
        normalizedProfile.additionalContext,
        ...collectEvidenceStrings(normalizedProfile),
      ]
        .filter(Boolean)
        .join(" "),
    )

    const jobKeywords = extractTopKeywords(combinedJob)
    const resumeKeywords = extractTopKeywords(resumeEvidence)
    const { keywordScore } = computeKeywordStats(jobKeywords, resumeKeywords)
    const roleCategory = inferRoleCategory(normalizedJob)

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(buildMockResponse(normalizedJob, normalizedProfile))
    }

    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
    })

    const completion = await openai.chat.completions.create({
      model: process.env.MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: buildMatchSystemPrompt(roleCategory) },
        {
          role: "user",
          content: buildMatchUserContent({
            jobSpec: normalizedJob,
            candidateProfile: normalizedProfile,
            cleanedJobDescription: combinedJob,
            cleanedResumeText: resumeEvidence,
            role: roleCategory,
            jobKeywords,
            resumeKeywords,
          }),
        },
      ],
      response_format: { type: "json_object" },
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error("No content returned from OpenAI.")
    }

    const parsed = MatchOutputSchema.parse(JSON.parse(content))
    const llmScore = clampScore(parsed.fit_score)
    const finalScore = clampScore(llmScore * 0.7 + keywordScore * 0.3)

    return NextResponse.json({
      ...parsed,
      fit_score: finalScore,
      llm_fit_score: llmScore,
      keyword_overlap: Math.round(keywordScore),
      highlights: parsed.highlights.slice(0, 6),
      gaps: parsed.gaps.slice(0, 6),
      verdict: parsed.verdict.trim(),
    })
  } catch (error) {
    console.error("[api/match] error", error)
    if (normalizedJob && normalizedProfile) {
      console.warn("[api/match] Returning mock output after failure.")
      return NextResponse.json(buildMockResponse(normalizedJob, normalizedProfile))
    }

    return NextResponse.json(
      { error: "Unable to generate match output.", details: error instanceof Error ? error.message : error },
      { status: 500 },
    )
  }
}
