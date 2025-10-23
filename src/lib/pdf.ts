import PDFDocument from "pdfkit"
import fs from "node:fs"
import { createRequire } from "node:module"
import type { CandidateProfile, MatchOutput } from "@/types"

type CreateResumeOptions = {
  includeCoverLetter?: boolean
}

const bullet = (doc: PDFKit.PDFDocument, text: string) => {
  doc.circle(doc.x + 4, doc.y + 6, 2).fill()
  doc.fillColor("black").text(text, doc.x + 12, doc.y + 1, {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 12,
  })
  doc.moveDown(0.4)
}

const sectionTitle = (doc: PDFKit.PDFDocument, title: string) => {
  doc.moveDown(0.6)
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#111827")
    .text(title.toUpperCase(), { characterSpacing: 1.2 })
  doc.moveDown(0.2)
  doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor("#e5e7eb").lineWidth(1).stroke()
  doc.moveDown(0.4)
}

const ensureStandardFontsPatched = (() => {
  let patched = false
  return () => {
    if (patched) return
    patched = true

    const require = createRequire(import.meta.url)
    const standardFontFiles = [
      "Courier.afm",
      "Courier-Bold.afm",
      "Courier-Oblique.afm",
      "Courier-BoldOblique.afm",
      "Helvetica.afm",
      "Helvetica-Bold.afm",
      "Helvetica-Oblique.afm",
      "Helvetica-BoldOblique.afm",
      "Times-Roman.afm",
      "Times-Bold.afm",
      "Times-Italic.afm",
      "Times-BoldItalic.afm",
      "Symbol.afm",
      "ZapfDingbats.afm",
    ] as const

    const fontBuffers = new Map<string, Buffer>()

    for (const fileName of standardFontFiles) {
      try {
        const resolved = require.resolve(`pdfkit/js/data/${fileName}`)
        const buffer = fs.readFileSync(resolved)
        fontBuffers.set(fileName, buffer)
      } catch (error) {
        console.warn(`[pdfkit] Failed to preload font data for ${fileName}`, error)
      }
    }

    const originalReadFileSync = fs.readFileSync

    const patchedReadFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
      const [filePath, options] = args

      if (typeof filePath === "string") {
        const normalized = filePath.replace(/\\/g, "/")
        const idx = normalized.indexOf("/pdfkit/js/data/")
        if (idx !== -1) {
          const fileName = normalized.slice(idx + "/pdfkit/js/data/".length)
          const buffer = fontBuffers.get(fileName)
          if (buffer) {
            if (typeof options === "string") {
              return Buffer.from(buffer).toString(options)
            }
            if (options && typeof options === "object" && options.encoding) {
              const encoding = options.encoding === null ? undefined : options.encoding
              return Buffer.from(buffer).toString(encoding)
            }
            return Buffer.from(buffer)
          }
        }
      }

      return originalReadFileSync(...args)
    }) as typeof fs.readFileSync

    fs.readFileSync = patchedReadFileSync
  }
})()

export const createResumePdf = async (
  profile: CandidateProfile,
  matchOutput: MatchOutput,
  options: CreateResumeOptions = {},
): Promise<Buffer> => {
  ensureStandardFontsPatched()

  const contactName = profile.contact.name || "Candidate"
  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `${contactName} — Job Ready Resume` } })
  const chunks: Buffer[] = []

  doc.on("data", (chunk) => chunks.push(chunk as Buffer))

  const completion = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
  })

  doc.font("Helvetica-Bold").fontSize(22).fillColor("#111827").text(contactName, { continued: false })

  const contactLine = [
    profile.contact.email,
    profile.contact.phone,
    profile.contact.linkedin,
    profile.contact.portfolio,
    profile.location,
  ]
    .filter(Boolean)
    .join(" • ")

  if (contactLine) {
    doc.moveDown(0.2)
    doc.font("Helvetica").fontSize(10).fillColor("#374151").text(contactLine)
  }

  if (profile.title) {
    doc.moveDown(0.2)
    doc.font("Helvetica").fontSize(11).fillColor("#111827").text(profile.title)
  }

  if (profile.skills.length || profile.tools.length) {
    sectionTitle(doc, "Core Skills")
    const unifiedSkills = Array.from(new Set([...profile.skills, ...profile.tools]))
    doc.font("Helvetica").fontSize(10).fillColor("#111827").text(unifiedSkills.join(" · "), {
      lineGap: 4,
    })
  }

  sectionTitle(doc, "Fit Summary")
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827").text(`Verdict: ${matchOutput.verdict}`)
  const scoreSummary = [
    `Fit Score: ${matchOutput.fit_score}/100`,
    matchOutput.llm_fit_score !== undefined ? `LLM Score: ${matchOutput.llm_fit_score}/100` : null,
    matchOutput.keyword_overlap !== undefined ? `Keyword Overlap: ${matchOutput.keyword_overlap}%` : null,
  ]
    .filter(Boolean)
    .join(" • ")
  doc.moveDown(0.2)
  doc.font("Helvetica").fontSize(10).fillColor("#111827").text(scoreSummary)

  if (matchOutput.highlights.length) {
    sectionTitle(doc, "Strength Highlights")
    doc.font("Helvetica").fontSize(10)
    matchOutput.highlights.forEach((item) => bullet(doc, item))
  }

  if (matchOutput.gaps.length) {
    sectionTitle(doc, "Gaps & Follow-ups")
    doc.font("Helvetica").fontSize(10)
    matchOutput.gaps.forEach((item) => bullet(doc, item))
  }

  if (profile.projects.length) {
    sectionTitle(doc, "Projects")
    doc.font("Helvetica").fontSize(10)
    profile.projects.forEach((project) => {
      const name = project.name || "Untitled Project"
      const summary = project.summary || ""
      doc.font("Helvetica-Bold").text(name)
      doc.font("Helvetica").text(summary, { lineGap: 4 })
      if (project.skills.length) {
        doc.font("Helvetica-Oblique").fontSize(9).text(`Stack: ${project.skills.join(", ")}`)
      }
      if (project.outcomes.length) {
        doc.font("Helvetica").fontSize(9).text(`Outcomes: ${project.outcomes.join("; ")}`)
      }
      doc.moveDown(0.6)
    })
  }

  if (options.includeCoverLetter) {
    sectionTitle(doc, "Follow-up Narrative")
    const narrativeLines = [
      `Verdict: ${matchOutput.verdict}`,
      "",
      matchOutput.highlights.length ? `Strengths: ${matchOutput.highlights.join("; ")}` : null,
      matchOutput.gaps.length ? `Gaps: ${matchOutput.gaps.join("; ")}` : null,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n")

    doc.font("Helvetica").fontSize(10).text(narrativeLines || "Summary currently unavailable.", {
      lineGap: 4,
    })
  }

  doc.end()
  return completion
}
