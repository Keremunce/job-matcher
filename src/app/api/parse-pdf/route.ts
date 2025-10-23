import { Buffer } from "node:buffer"
import { spawn } from "node:child_process"
import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

import { normalizeCandidateProfile } from "@/lib/normalizers"
import type { CandidateProfile } from "@/types"
import { CandidateProfileSchema } from "@/types"

export const runtime = "nodejs"

const readStream = async (stream: NodeJS.ReadableStream | null) => {
  if (!stream) {
    return ""
  }

  stream.setEncoding("utf8")
  let data = ""
  for await (const chunk of stream) {
    data += chunk
  }
  return data
}

const INLINE_PARSER_SOURCE = [
  'const { Buffer } = require("node:buffer");',
  'const { PDFParse } = require("pdf-parse");',
  "",
  "(async () => {",
  "  const chunks = []",
  "  for await (const chunk of process.stdin) {",
  "    chunks.push(chunk)",
  "  }",
  "  if (chunks.length === 0) {",
  '    console.error("No input received on stdin")',
  "    process.exit(1)",
  "  }",
  "  const buffer = Buffer.concat(chunks)",
  "  const parser = new PDFParse({ data: buffer })",
  "  const result = await parser.getText()",
  '  const text = result && typeof result.text === "string" ? result.text : ""',
  "  process.stdout.write(JSON.stringify({ text }))",
  "})().catch((error) => {",
  "  const message = error && error.stack ? error.stack : error && error.message ? error.message : String(error)",
  "  console.error(message)",
  "  process.exit(1)",
  "})",
].join(";\n")

const PARSE_SYSTEM_PROMPT = `
You are an assistant that converts resume text into a structured JSON object.
- Use ONLY the provided resumeText content. Do not invent people, companies, dates, or accomplishments.
- Omit fields that are not present in the resume.
- JSON structure:
  {
    "contact": {
      "name": string,
      "email"?: string,
      "phone"?: string,
      "linkedin"?: string,
      "portfolio"?: string
    },
    "title"?: string,
    "location"?: string,
    "skills": string[],
    "tools": string[],
    "projects": [
      {
        "name": string,
        "summary": string,
        "skills": string[],
        "outcomes": string[]
      }
    ]
  }
- Skills, tools, and outcomes must be lists of unique, trimmed strings.
- Project summaries should be concise descriptions (1-2 sentences). Outcomes should be individual bullet points or achievements.
- If a value is unknown, omit the field rather than guessing.
`

const SECTION_HEADINGS = new Set(
  [
    "about",
    "profile",
    "summary",
    "objective",
    "what i've done",
    "what i want to achieve",
    "experience",
    "work experience",
    "professional experience",
    "projects",
    "skills",
    "technical skills",
    "tools",
    "toolbox",
    "education",
    "certifications",
    "language",
    "languages",
    "contact",
    "willing to relocate",
  ].map((value) => value.toLowerCase()),
)

const BULLET_PREFIX = /^[\s\t•*·\-–—²▪›»●◦]+\s*/

const sanitizeLine = (line: string) => line.replace(BULLET_PREFIX, "").replace(/[<>]+$/, "").trim()

const toUrl = (value?: string) => {
  if (!value) return undefined
  try {
    return new URL(value).toString()
  } catch {
    return undefined
  }
}

const extractSectionList = (lines: string[], label: string) => {
  const lowerLabel = label.toLowerCase()
  const values = new Set<string>()
  let active = false

  for (const line of lines) {
    const raw = line.trim()
    const cleaned = sanitizeLine(raw)
    const normalized = cleaned.toLowerCase()

    if (!active) {
      if (normalized === lowerLabel || normalized.startsWith(`${lowerLabel}:`)) {
        active = true
      }
      continue
    }

    if (!cleaned) {
      if (values.size > 0) {
        break
      }
      continue
    }

    if (SECTION_HEADINGS.has(normalized) && normalized !== lowerLabel) {
      break
    }

    if (normalized.startsWith(lowerLabel)) {
      continue
    }

    const candidates = cleaned
      .split(/[,;•·|]/)
      .map((part) => part.replace(/^[^A-Za-z0-9+]+/, "").trim())
      .filter(Boolean)

    if (candidates.length) {
      candidates.forEach((candidate) => values.add(candidate))
    } else {
      values.add(cleaned)
    }
  }

  return Array.from(values)
}

const extractProjects = (lines: string[]): CandidateProfile["projects"] => {
  const projects: Array<{ name: string; summary: string; outcomes: string[] }> = []
  let inExperience = false
  let current: { name: string; summary: string; outcomes: string[] } | null = null

  const pushCurrent = () => {
    if (current) {
      projects.push({
        name: current.name.trim(),
        summary: current.summary.trim(),
        outcomes: Array.from(new Set(current.outcomes.map((item) => item.trim()).filter(Boolean))),
      })
      current = null
    }
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      continue
    }

    const cleaned = sanitizeLine(trimmed)
    const normalized = cleaned.toLowerCase()

    if (SECTION_HEADINGS.has(normalized)) {
      if (normalized === "work experience" || normalized === "experience" || normalized === "professional experience") {
        inExperience = true
        pushCurrent()
        continue
      }

      if (inExperience) {
        pushCurrent()
      }
      inExperience = false
      continue
    }

    if (!inExperience) {
      continue
    }

    const jobMatch = cleaned.match(/^(.+?)\s*@\s*(.+)$/)
    const role = jobMatch?.[1]?.trim()
    const company = jobMatch?.[2]?.trim()
    if (role || company) {
      pushCurrent()
      current = {
        name: company ?? "",
        summary: role ?? "",
        outcomes: [],
      }
      continue
    }

    if (!current) {
      continue
    }

    if (cleaned) {
      current.outcomes.push(cleaned)
    }
  }

  pushCurrent()

  return projects
    .filter((project) => project.name || project.summary || project.outcomes.length > 0)
    .map((project) => ({
      name: project.name || project.summary || "Untitled Project",
      summary: project.summary || project.name || "Summary forthcoming.",
      skills: [],
      outcomes: project.outcomes,
    }))
}

const buildFallbackProfile = (text: string): CandidateProfile => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const name = lines[0]?.replace(/\s{2,}.+$/, "").trim() || "Candidate"
  const title = lines.slice(1, 6).find((line) => /\b(developer|engineer|designer|manager|specialist)\b/i.test(line))

  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  const phoneMatch = text.match(/(\+?\d[\d\s().-]{7,}\d)/)
  const urlMatches = Array.from(text.matchAll(/https?:\/\/[^\s)]+/gi)).map((match) =>
    match[0].replace(/[.,)]+$/, ""),
  )
  const linkedin = urlMatches.find((url) => url.toLowerCase().includes("linkedin"))
  const portfolio = urlMatches.find((url) => url !== linkedin)

  let location: string | undefined
  const relocateIndex = lines.findIndex((line) => line.toLowerCase().includes("willing to relocate"))
  if (relocateIndex >= 0) {
    const candidate = lines.slice(relocateIndex, relocateIndex + 4).find((line) => line.includes("/") || line.includes(","))
    if (candidate) {
      location = candidate
    }
  }

  if (!location) {
    location = lines.find(
      (line) =>
        /[A-Za-z]+(?:\s*[\/,]\s*[A-Za-z]+)+/.test(line) &&
        !line.toLowerCase().includes("developer") &&
        !line.toLowerCase().includes("designer"),
    )
  }

  const skills = extractSectionList(lines, "skills")
  const tools = extractSectionList(lines, "tools")
  const projects = extractProjects(lines)

  const parsed = CandidateProfileSchema.parse({
    contact: {
      name,
      email: emailMatch?.[0]?.replace(/[.,;]+$/, "").trim(),
      phone: phoneMatch?.[0]?.replace(/\s+/g, " ").trim(),
      linkedin: toUrl(linkedin),
      portfolio: toUrl(portfolio),
    },
    title,
    location,
    skills,
    tools,
    projects,
  })

  return normalizeCandidateProfile(parsed)
}

const MAX_AI_INPUT_LENGTH = 15000

const buildCandidateProfile = async (text: string): Promise<CandidateProfile> => {
  const fallbackProfile = buildFallbackProfile(text)
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return fallbackProfile
  }

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
    })

    const truncated = text.length > MAX_AI_INPUT_LENGTH ? text.slice(0, MAX_AI_INPUT_LENGTH) : text

    const completion = await openai.chat.completions.create({
      model: process.env.RESUME_MODEL || process.env.MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: PARSE_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({ resumeText: truncated }) },
      ],
      response_format: { type: "json_object" },
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error("No content returned from OpenAI.")
    }

    const parsedJson = JSON.parse(content)
    const parsedProfile = CandidateProfileSchema.safeParse(parsedJson)
    if (!parsedProfile.success) {
      throw new Error(parsedProfile.error.message)
    }

    return normalizeCandidateProfile(parsedProfile.data)
  } catch (error) {
    console.error("[api/parse-pdf] AI parsing failed, using heuristic fallback.", error)
    return fallbackProfile
  }
}

const runPdfTextExtract = async (buffer: Buffer) => {
  const proc = spawn(process.execPath, ["-e", INLINE_PARSER_SOURCE], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  })

  proc.stdin?.write(buffer)
  proc.stdin?.end()

  const stdoutPromise = readStream(proc.stdout)
  const stderrPromise = readStream(proc.stderr)

  const exitCode: number = await new Promise((resolve, reject) => {
    proc.on("error", (error) => reject(error))
    proc.on("close", (code) => resolve(code ?? 0))
  })

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `pdf-text-extract exited with code ${exitCode}`)
  }

  if (!stdout.trim()) {
    throw new Error(stderr.trim() || "pdf-text-extract produced no output.")
  }

  return stdout
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No file" }, { status: 400 })
    }

    const pdfBuffer = Buffer.from(await file.arrayBuffer())

    const rawOutput = await runPdfTextExtract(pdfBuffer)
    let parsed: { text?: string }

    try {
      parsed = JSON.parse(rawOutput)
    } catch (error) {
      throw new Error(
        error instanceof Error ? `Invalid parser JSON: ${error.message}` : "Invalid parser JSON.",
      )
    }

    const text = typeof parsed.text === "string" ? parsed.text.trim() : ""
    if (!text) {
      return NextResponse.json(
        { error: "No extractable text detected in PDF. Try OCR fallback." },
        { status: 422 },
      )
    }

    const candidateProfile = await buildCandidateProfile(text)
    return NextResponse.json(candidateProfile)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Failed to parse resume PDF", details: message },
      { status: 500 },
    )
  }
}
