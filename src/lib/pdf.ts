import PDFDocument from "pdfkit"
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

export const createResumePdf = async (
  profile: CandidateProfile,
  matchOutput: MatchOutput,
  options: CreateResumeOptions = {},
): Promise<Buffer> => {
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

  sectionTitle(doc, "JD-Aligned Highlights")
  doc.font("Helvetica").fontSize(10)
  matchOutput.bullets.forEach((item) => bullet(doc, item))

  if (matchOutput.talkingPoints.length) {
    sectionTitle(doc, "Talking Points")
    doc.fillColor("#111827")
    matchOutput.talkingPoints.forEach((item) => bullet(doc, item))
  }

  if (matchOutput.risks.length) {
    sectionTitle(doc, "Risk Acknowledgements")
    doc.font("Helvetica").fontSize(10)
    matchOutput.risks.forEach((risk) => {
      const prefix =
        risk.type === "adjacent" ? "Adjacency" : risk.type === "soft" ? "Development Area" : "Gap"
      bullet(doc, `${prefix}: ${risk.gap} — Mitigation: ${risk.mitigation}`)
    })
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

  if (options.includeCoverLetter && matchOutput.coverLetter) {
    sectionTitle(doc, "Cover Letter Snapshot")
    doc.font("Helvetica").fontSize(10).text(matchOutput.coverLetter, {
      lineGap: 4,
    })
  }

  doc.end()
  return completion
}
