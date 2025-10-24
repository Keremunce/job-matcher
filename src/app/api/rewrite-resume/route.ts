import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { z } from "zod"

import type { CandidateProfile, RewriteResume } from "@/types"
import { CandidateProfileSchema, JobSpecSchema } from "@/types/schemas/core"
import { MatchOutputSchema } from "@/types/schemas/match"
import { RewriteResumeSchema } from "@/types/schemas/rewrite"
import {
  cleanJobDescription,
  cleanResumeText,
  collectEvidenceStrings,
  asciiSafe,
  dedupeLines,
  normalizeCandidateProfile,
  normalizeJobSpec,
  sanitizeProjectTitle,
  stripNameFromSummary,
} from "@/lib/normalizers"
import { buildRewriteSystemPrompt, buildRewriteUserContent } from "@/lib/truth-guard"

const sanitizeBulletArray = (items: string[], limit = 3): string[] => {
  const deduped = dedupeLines(items.join("\n"))
    .split("\n")
    .map((line) => asciiSafe(line))
    .filter(Boolean)
  return deduped.slice(0, limit)
}

const sanitizeRewritePayload = (payload: RewriteResume, targetRole: string, candidateName: string): RewriteResume => {
  const location = payload.contact.location ? asciiSafe(payload.contact.location) : undefined
  const safeContact = {
    name: asciiSafe(payload.contact.name || candidateName || "Candidate"),
    email: payload.contact.email?.trim() ?? undefined,
    phone: payload.contact.phone?.trim() ?? undefined,
    linkedin: payload.contact.linkedin?.trim() ?? undefined,
    website: payload.contact.website?.trim() ?? undefined,
    behance: payload.contact.behance?.trim() ?? undefined,
    location,
  }

  const rawSkills = payload.skills ?? []
  const skills = Array.from(new Set(rawSkills.map((skill) => asciiSafe(skill)).filter(Boolean)))

  const experience = (payload.experience ?? []).map((entry) => ({
    company: asciiSafe(sanitizeProjectTitle(entry.company || "")),
    role: asciiSafe(entry.role || targetRole),
    dates: entry.dates ? asciiSafe(entry.dates) : undefined,
    bullets: sanitizeBulletArray(entry.bullets ?? [], 3),
  }))

  const projects = payload.projects?.map((project) => ({
    title: asciiSafe(sanitizeProjectTitle(project.title || "")),
    bullets: sanitizeBulletArray(project.bullets ?? [], 2),
  }))

  const education = payload.education?.map((item) => ({
    school: asciiSafe(item.school || ""),
    degree: item.degree ? asciiSafe(item.degree) : undefined,
    dates: item.dates ? asciiSafe(item.dates) : undefined,
  }))

  return {
    contact: safeContact,
    headline: asciiSafe(targetRole),
    summary: asciiSafe(stripNameFromSummary(payload.summary || "", candidateName)),
    skills,
    experience,
    projects,
    education,
  }
}

const RewritePayloadSchema = z.object({
  candidateProfile: CandidateProfileSchema,
  jobSpec: JobSpecSchema,
  matchOutput: MatchOutputSchema,
})

const buildFallbackResume = (profile: CandidateProfile, targetRole: string, highlights: string[], gaps: string[]): RewriteResume => {
  const summaryParts = [
    profile.additionalContext?.trim(),
    highlights.length ? `Strengths: ${highlights.join(", ")}` : null,
    gaps.length ? `Focus Areas: ${gaps.join(", ")}` : null,
  ].filter(Boolean)

  const combinedSkills = Array.from(new Set([...profile.skills, ...profile.tools].map((skill) => asciiSafe(skill))))

  const experienceEntries = profile.projects.slice(0, 2).map((project) => ({
    company: asciiSafe(sanitizeProjectTitle(project.name ?? "Project")),
    role: targetRole,
    bullets: dedupeLines([
      project.summary,
      ...project.outcomes,
      profile.additionalContext ?? "",
    ].filter(Boolean).join("\n"))
      .split("\n")
      .map((line) => asciiSafe(line))
      .filter(Boolean)
      .slice(0, 3),
  }))

  const projectEntries = profile.projects.map((project) => ({
    title: asciiSafe(sanitizeProjectTitle(project.name ?? "Project")),
    bullets: dedupeLines([project.summary, ...project.outcomes].filter(Boolean).join("\n"))
      .split("\n")
      .map((line) => asciiSafe(line))
      .filter(Boolean)
      .slice(0, 2),
  }))

  const summary = summaryParts.length
    ? asciiSafe(stripNameFromSummary(summaryParts.join(". "), profile.contact.name || ""))
    : asciiSafe(targetRole)

  const fallback: RewriteResume = {
    contact: {
      name: profile.contact.name,
      email: profile.contact.email ?? undefined,
      phone: profile.contact.phone ?? undefined,
      linkedin: profile.contact.linkedin ?? undefined,
      website: profile.contact.website ?? profile.contact.portfolio ?? undefined,
      behance: profile.contact.behance ?? undefined,
      location: profile.location ? asciiSafe(profile.location) : undefined,
    },
    headline: targetRole,
    summary,
    skills: combinedSkills.filter(Boolean),
    experience: experienceEntries.map((entry) => ({
      company: entry.company,
      role: entry.role,
      bullets: entry.bullets,
    })),
  }

  if (projectEntries.length) {
    fallback.projects = projectEntries
  }

  return fallback
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
      response_format: { type: "json_object" },
    })

    const rewrite = completion.choices[0]?.message?.content?.trim()
    if (!rewrite) {
      throw new Error("No rewrite suggestions returned from OpenAI.")
    }

    let parsed: RewriteResume
    try {
      const jsonPayload = JSON.parse(rewrite)
      parsed = RewriteResumeSchema.parse(jsonPayload)
    } catch (error) {
      throw new Error(`Unable to parse rewrite response: ${error instanceof Error ? error.message : String(error)}`)
    }

    const sanitized = sanitizeRewritePayload(parsed, targetRole, normalizedProfile.contact.name)

    return NextResponse.json({ rewrite: sanitized })
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
