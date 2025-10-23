import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import {
  CandidateProfile,
  CandidateProfileSchema,
  JobSpec,
  JobSpecSchema,
  MatchOutput,
  MatchOutputSchema,
  MatchPayloadSchema,
} from "@/types"
import { normalizeCandidateProfile, normalizeJobSpec } from "@/lib/normalizers"
import { MATCH_SYSTEM_PROMPT, buildMatchUserContent } from "@/lib/truth-guard"

function buildMockResponse(job: JobSpec, profile: CandidateProfile): MatchOutput {
  const responsibilities = job.responsibilities.length ? job.responsibilities : ["the role requirements"]
  const skillPool = profile.skills.length
    ? profile.skills
    : profile.projects.flatMap((project) => project.skills)

  const skills = skillPool.length ? skillPool : ["core strengths"]
  const firstResponsibility = responsibilities[0]
  const primarySkill = skills[0]

  return {
    fitScore: 55,
    rationale: [
      `Evidence of ${primarySkill} partially supports "${firstResponsibility}".`,
      "Further examples would raise the confidence score.",
    ],
    bullets: [
      `Applied ${primarySkill} in recent projects to address ${firstResponsibility.toLowerCase()}.`,
    ],
    coverLetter: `Hello,\n\nBased on my experience with ${primarySkill}, I can contribute to ${firstResponsibility}. I focus on truthful, impact-oriented delivery and am keen to learn more about the role.\n\nBest,\n${profile.contact.name}`,
    talkingPoints: [
      `Discuss how ${primarySkill} was used to deliver a noteworthy outcome.`,
      "Call out preparation to close any highlighted gaps.",
    ],
    risks: [
      {
        gap: "Limited direct evidence for several responsibilities.",
        mitigation: "Prepare transferable examples and outline an accelerated learning plan.",
        type: "missing",
      },
    ],
    trace: responsibilities.map((requirement) => ({
      requirement,
      matched: skills.filter((skill) =>
        requirement.toLowerCase().includes(skill.toLowerCase()),
      ),
    })),
  }
}

export async function POST(req: NextRequest) {
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

    const normalizedJob = normalizeJobSpec(jobSpecResult.data)
    const normalizedProfile = normalizeCandidateProfile(profileResult.data)

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
        { role: "system", content: MATCH_SYSTEM_PROMPT },
        { role: "user", content: buildMatchUserContent(normalizedJob, normalizedProfile) },
      ],
      response_format: { type: "json_object" },
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error("No content returned from OpenAI.")
    }

    const parsed = MatchOutputSchema.parse(JSON.parse(content))
    return NextResponse.json(parsed)
  } catch (error) {
    console.error("[api/match] error", error)
    return NextResponse.json(
      { error: "Unable to generate match output.", details: error instanceof Error ? error.message : error },
      { status: 500 },
    )
  }
}
