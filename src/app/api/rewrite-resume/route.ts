import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { z } from "zod"

import { CandidateProfile, CandidateProfileSchema, JobSpecSchema, MatchOutputSchema } from "@/types"
import {
  cleanJobDescription,
  cleanResumeText,
  collectEvidenceStrings,
  normalizeCandidateProfile,
  normalizeJobSpec,
} from "@/lib/normalizers"
import { buildRewriteSystemPrompt, buildRewriteUserContent } from "@/lib/truth-guard"

const RewritePayloadSchema = z.object({
  candidateProfile: CandidateProfileSchema,
  jobSpec: JobSpecSchema,
  matchOutput: MatchOutputSchema,
})

const buildFallbackResume = (profile: CandidateProfile, targetRole: string, highlights: string[], gaps: string[]) => {
  const lines: string[] = []
  lines.push(profile.contact.name || "Candidate")
  lines.push(targetRole ? `Target Role: ${targetRole}` : "")
  if (profile.title) {
    lines.push(`Current Title: ${profile.title}`)
  }
  if (profile.location) {
    lines.push(`Location: ${profile.location}`)
  }
  lines.push("")

  const summaryPieces = [
    profile.additionalContext,
    highlights.length ? `Strengths: ${highlights.join("; ")}` : null,
    gaps.length ? `Focus Areas: ${gaps.join("; ")}` : null,
  ].filter(Boolean)

  if (summaryPieces.length) {
    lines.push("Summary")
    lines.push(summaryPieces.join(" "))
    lines.push("")
  }

  if (profile.skills.length || profile.tools.length) {
    lines.push("Skills")
    const combined = Array.from(new Set([...profile.skills, ...profile.tools]))
    lines.push(combined.join(", "))
    lines.push("")
  }

  if (profile.projects.length) {
    lines.push("Experience")
    profile.projects.forEach((project) => {
      lines.push(`${project.name} — ${project.summary}`)
      if (project.skills.length) {
        lines.push(`Stack: ${project.skills.join(", ")}`)
      }
      if (project.outcomes.length) {
        lines.push(`Outcomes: ${project.outcomes.join("; ")}`)
      }
      lines.push("")
    })
  }

  return lines.join("\n").trim()
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null)
    if (!json) {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 })
    }

    const payloadResult = RewritePayloadSchema.safeParse(json)
    if (!payloadResult.success) {
      return NextResponse.json(
        { error: "Invalid rewrite payload.", details: payloadResult.error.format() },
        { status: 422 },
      )
    }

    const normalizedProfile = normalizeCandidateProfile(payloadResult.data.candidateProfile)
    const normalizedJob = normalizeJobSpec(payloadResult.data.jobSpec)
    const matchOutput = payloadResult.data.matchOutput

    const cleanedJob = cleanJobDescription(
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

    const apiKey = process.env.OPENAI_API_KEY
    const targetRole = normalizedJob.title || "Target Role"

    if (!apiKey) {
      return NextResponse.json({
        rewrite: buildFallbackResume(normalizedProfile, targetRole, matchOutput.highlights, matchOutput.gaps),
      })
    }

    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
    })

    const systemPrompt = buildRewriteSystemPrompt(targetRole)
    const userContent = buildRewriteUserContent({
      targetRole,
      cleanedJobDescription: cleanedJob,
      candidateProfile: normalizedProfile,
      cleanedResumeText: resumeEvidence,
      matchHighlights: matchOutput.highlights,
      matchGaps: matchOutput.gaps,
      matchVerdict: matchOutput.verdict,
    })

    const completion = await openai.chat.completions.create({
      model: process.env.MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    })

    const rewrite = completion.choices[0]?.message?.content?.trim()
    if (!rewrite) {
      throw new Error("No rewrite suggestions returned from OpenAI.")
    }

    return NextResponse.json({ rewrite })
  } catch (error) {
    console.error("[api/rewrite-resume] error", error)
    return NextResponse.json(
      {
        error: "Failed to improve resume.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
