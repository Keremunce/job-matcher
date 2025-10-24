import PDFDocument from "pdfkit"
import fs from "node:fs"
import path from "node:path"

import type { CandidateProfile, RewriteResume } from "@/types"
import { asciiSafe, composeContact, sanitizeProjectTitle } from "@/lib/normalizers"

export const BUNDLED_FONT_PATH = path.resolve(process.cwd(), "public", "fonts", "Roboto-Regular.ttf")

const ensureBundledFontPath = () => {
  if (!fs.existsSync(BUNDLED_FONT_PATH)) {
    throw new Error(`[pdf] Bundled font not found at ${BUNDLED_FONT_PATH}`)
  }

  return BUNDLED_FONT_PATH
}

const ensureAscii = (value: string | undefined | null): string => asciiSafe(value ?? "")

const renderSectionTitle = (doc: PDFKit.PDFDocument, title: string) => {
  doc.moveDown(0.9)
  doc.fontSize(11).text(ensureAscii(title).toUpperCase())
  doc.moveDown(0.15)
}

const renderParagraph = (doc: PDFKit.PDFDocument, text: string) => {
  const content = ensureAscii(text)
  if (!content) return
  doc.fontSize(10).text(content, {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    lineGap: 4,
  })
  doc.moveDown(0.2)
}

const renderLine = (doc: PDFKit.PDFDocument, text: string, marginBottom = 0.25) => {
  const content = ensureAscii(text)
  if (!content) return
  doc.fontSize(10).text(content, {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
  })
  if (marginBottom > 0) doc.moveDown(marginBottom)
}


const renderList = (doc: PDFKit.PDFDocument, items: string[], prefix = "- ") => {
  items.forEach((item) => {
    const content = ensureAscii(item)
    if (!content) return
    doc.fontSize(10).text(`${prefix}${content}`, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    })
  })
  if (items.length) {
    doc.moveDown(0.2)
  }
}

const sanitizeExperienceHeader = (company: string, role: string, dates?: string) => {
  const parts = [ensureAscii(company), ensureAscii(role), ensureAscii(dates)]
    .filter((value) => value && value.length > 0)
  return parts.join(" - ")
}

const sanitizeProjectTitleLine = (title: string) => ensureAscii(sanitizeProjectTitle(title))

export const createResumePdf = async (profile: CandidateProfile, optimized: RewriteResume): Promise<Buffer> => {
  const fontPath = ensureBundledFontPath()
  const doc = new PDFDocument({ size: "A4", margin: 50, font: fontPath })
  const chunks: Buffer[] = []

  doc.on("data", (chunk) => chunks.push(chunk as Buffer))

  const completion = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
  })

  doc.fillColor("#111827")

  const fullName = ensureAscii(optimized.contact.name || profile.contact.name || "Candidate")
  const headline = ensureAscii(optimized.headline)

  const contactMeta = composeContact({
    email: optimized.contact.email ?? profile.contact.email,
    phone: optimized.contact.phone ?? profile.contact.phone,
    linkedin: optimized.contact.linkedin ?? profile.contact.linkedin,
    website: optimized.contact.website ?? profile.contact.website ?? profile.contact.portfolio,
    behance: optimized.contact.behance ?? profile.contact.behance,
    location: optimized.contact.location ?? profile.location,
  })

  const contactTop = ensureAscii(contactMeta.top)
  const contactBottom = ensureAscii(contactMeta.bottom)

  doc.fontSize(18).text(fullName.toUpperCase())
  doc.moveDown(0.2)
  renderLine(doc, headline)
  doc.moveDown(0.2)
  if (contactTop) {
    renderLine(doc, contactTop)
  }
  if (contactBottom) {
    renderLine(doc, contactBottom)
  }

  doc.moveDown(0.4)

  if (optimized.summary) {
    renderSectionTitle(doc, "Summary")
    renderParagraph(doc, optimized.summary)
  }

  const skillsList = optimized.skills ?? []
  if (skillsList.length) {
    renderSectionTitle(doc, "Skills")
    renderLine(doc, skillsList.map(ensureAscii).filter(Boolean).join(" | "))
  }

  const experienceEntries = optimized.experience ?? []
  if (experienceEntries.length) {
    renderSectionTitle(doc, "Experience")
    experienceEntries.forEach((entry) => {
      const header = sanitizeExperienceHeader(entry.company, entry.role, entry.dates)
      if (header) {
        renderLine(doc, header, 0.3)
      }
      if (entry.bullets?.length) {
        renderList(doc, entry.bullets)
      }
      doc.moveDown(0.1)
    })
  }

  if (optimized.projects && optimized.projects.length) {
    renderSectionTitle(doc, "Projects")

    optimized.projects.forEach((project, index) => {
      const title = sanitizeProjectTitleLine(project.title)
      if (title) {
        renderLine(doc, title, 0.3)
      }

      if (project.bullets?.length) {
        renderList(doc, project.bullets, "- ")
      }

      const isLast = index === optimized.projects.length - 1
      if (!isLast) {
        doc.moveDown(0.4)
      }
    })

    const behanceUrl = optimized.contact.behance || profile.contact.behance
    if (behanceUrl) {
      const trimmedBehance = behanceUrl.trim()
      const slug = ensureAscii(
        trimmedBehance
          .replace(/^https?:\/\/(www\.)?behance\.net\/?/i, "")
          .replace(/^@/, "")
          .replace(/^\/+/, "")
      )
      const sanitizedInput = ensureAscii(trimmedBehance)
      const portfolioText = slug
        ? `For portfolio → https://behance.net/${slug}`
        : `For portfolio → ${sanitizedInput}`

      doc.moveDown(0.8)
      doc
        .fontSize(10)
        .fillColor("#4B5563")
        .text(portfolioText, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        })
      doc.fillColor("#111827")
    }
  }

  if (optimized.education && optimized.education.length) {
    renderSectionTitle(doc, "Education")
    optimized.education.forEach((entry) => {
      const parts = [ensureAscii(entry.school), ensureAscii(entry.degree), ensureAscii(entry.dates)]
        .filter((value) => value && value.length > 0)
      if (parts.length) {
        renderLine(doc, parts.join(" - "))
      }
    })
  }

  doc.end()
  return completion
}
