import PDFDocument from "pdfkit"
import fs from "node:fs"
import path from "node:path"

import type { CandidateProfile, RewriteResume } from "@/types"
import { asciiSafe, composeContact, sanitizeProjectTitle } from "@/lib/normalizers"

export const BUNDLED_FONT_PATH = path.resolve(process.cwd(), "public", "fonts", "Roboto-Regular.ttf")

const SECTION_TITLE_COLOR = "#374151"
const BODY_COLOR = "#111827"
const FOOTNOTE_COLOR = "#4B5563"
const SECTION_TITLE_FONT_SIZE = 13
const SUBTITLE_FONT_SIZE = 11
const BODY_FONT_SIZE = 10

const getContentWidth = (doc: PDFKit.PDFDocument) =>
  doc.page.width - doc.page.margins.left - doc.page.margins.right

const addVerticalSpace = (doc: PDFKit.PDFDocument, value: number) => {
  if (value > 0) {
    doc.moveDown(value)
  }
}

const ensureBundledFontPath = () => {
  if (!fs.existsSync(BUNDLED_FONT_PATH)) {
    throw new Error(`[pdf] Bundled font not found at ${BUNDLED_FONT_PATH}`)
  }

  return BUNDLED_FONT_PATH
}

const ensureAscii = (value: string | undefined | null): string => asciiSafe(value ?? "")

const renderSectionTitle = (
  doc: PDFKit.PDFDocument,
  title: string,
  options: { isFirstSection?: boolean } = {}
) => {
  const { isFirstSection = false } = options
  const baseSpacing = isFirstSection ? 0.7 : 0.8
  const spacingBeforeTitle = Math.max(baseSpacing - 0.3, 0)

  addVerticalSpace(doc, spacingBeforeTitle)
  addVerticalSpace(doc, 0.3)

  const content = ensureAscii(title).toUpperCase()
  const width = getContentWidth(doc)

  doc
    .font(BUNDLED_FONT_PATH)
    .fillColor(SECTION_TITLE_COLOR)
    .fontSize(SECTION_TITLE_FONT_SIZE)
    .text(content, { width })

  const ruleY = doc.y + 2
  doc
    .moveTo(doc.page.margins.left, ruleY)
    .lineTo(doc.page.width - doc.page.margins.right, ruleY)
    .lineWidth(1)
    .strokeColor(SECTION_TITLE_COLOR)
    .stroke()

  addVerticalSpace(doc, 0.5)
  doc.fillColor(BODY_COLOR).fontSize(BODY_FONT_SIZE).strokeColor(BODY_COLOR).lineWidth(1)
}

const renderParagraph = (doc: PDFKit.PDFDocument, text: string, marginBottom = 0.3) => {
  const content = ensureAscii(text)
  if (!content) return
  doc.font(BUNDLED_FONT_PATH)
    .fillColor(BODY_COLOR)
    .fontSize(BODY_FONT_SIZE)
    .text(content, {
      width: getContentWidth(doc),
    lineGap: 4,
  })
  addVerticalSpace(doc, marginBottom)
}

type LineOptions = {
  marginBottom?: number
  prefix?: string
  fontSize?: number
  color?: string
}

const renderLine = (doc: PDFKit.PDFDocument, text: string, options: LineOptions = {}) => {
  const {
    marginBottom = 0.3,
    prefix = "",
    fontSize = BODY_FONT_SIZE,
    color = BODY_COLOR,
  } = options
  const content = ensureAscii(text)
  if (!content) return
  doc
    .font(BUNDLED_FONT_PATH)
    .fillColor(color)
    .fontSize(fontSize)
    .text(`${prefix}${content}`, {
      width: getContentWidth(doc),
    })
  addVerticalSpace(doc, marginBottom)
  doc.fillColor(BODY_COLOR).fontSize(BODY_FONT_SIZE)
}

type TitledBlockOptions = {
  title?: string
  prefix?: string
  marginBefore?: number
  marginAfter?: number
  bullets?: string[]
  bulletPrefix?: string
  bulletSpacingAfter?: number
  titleFontSize?: number
  titleColor?: string
}

const renderTitledBlock = (doc: PDFKit.PDFDocument, options: TitledBlockOptions) => {
  const {
    title,
    prefix = "",
    marginBefore = 0,
    marginAfter = 0.25,
    bullets,
    bulletPrefix = "- ",
    bulletSpacingAfter,
    titleFontSize = SUBTITLE_FONT_SIZE,
    titleColor = BODY_COLOR,
  } = options

  addVerticalSpace(doc, marginBefore)

  if (title) {
    renderLine(doc, title, {
      marginBottom: marginAfter,
      prefix,
      fontSize: titleFontSize,
      color: titleColor,
    })
  } else {
    addVerticalSpace(doc, marginAfter)
  }

  if (bullets?.length) {
    const spacingAfter = bulletSpacingAfter ?? 0.2
    renderList(doc, bullets, bulletPrefix, spacingAfter)
  }
}

const renderList = (
  doc: PDFKit.PDFDocument,
  items: string[],
  prefix = "- ",
  spacingAfter = 0.3
) => {
  items.forEach((item) => {
    const content = ensureAscii(item)
    if (!content) return
    doc
      .font(BUNDLED_FONT_PATH)
      .fillColor(BODY_COLOR)
      .fontSize(BODY_FONT_SIZE)
      .text(`${prefix}${content}`, {
        width: getContentWidth(doc),
      lineGap: 4,
    })
  })
  if (items.length) {
    addVerticalSpace(doc, spacingAfter)
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

  doc.fillColor(BODY_COLOR).font(BUNDLED_FONT_PATH).fontSize(BODY_FONT_SIZE)

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
  addVerticalSpace(doc, 0.2)
  if (headline) {
    renderLine(doc, headline, { marginBottom: 0.2, fontSize: SUBTITLE_FONT_SIZE })
  }
  addVerticalSpace(doc, 0.1)
  if (contactTop) {
    renderLine(doc, contactTop, { marginBottom: 0.15 })
  }
  if (contactBottom) {
    renderLine(doc, contactBottom, { marginBottom: 0.2 })
  }

  let renderedSections = 0
  const renderSection = (title: string, renderContent: () => void) => {
    renderSectionTitle(doc, title, { isFirstSection: renderedSections === 0 })
    renderedSections += 1
    renderContent()
  }

  if (optimized.summary) {
    renderSection("Summary", () => {
      renderParagraph(doc, optimized.summary, 0)
    })
  }

  const skillsList = optimized.skills ?? []
  if (skillsList.length) {
    renderSection("Skills", () => {
      renderLine(doc, skillsList.map(ensureAscii).filter(Boolean).join(" | "), { marginBottom: 0 })
    })
  }

  const experienceEntries = optimized.experience ?? []
  if (experienceEntries.length) {
    renderSection("Experience", () => {
      experienceEntries.forEach((entry, index) => {
        const header = sanitizeExperienceHeader(entry.company, entry.role, entry.dates)
        renderTitledBlock(doc, {
          title: header || undefined,
          marginBefore: 0.4,
          marginAfter: header ? 0.3 : 0,
          bullets: entry.bullets,
          bulletSpacingAfter: 0,
          titleFontSize: SUBTITLE_FONT_SIZE,
          titleColor: BODY_COLOR,
        })
        if (index < experienceEntries.length - 1) {
          addVerticalSpace(doc, 0.6)
        }
      })
    })
  }

  if (optimized.projects && optimized.projects.length) {
    renderSection("Projects", () => {
      optimized.projects.forEach((project, index) => {
        const title = sanitizeProjectTitleLine(project.title)
        renderTitledBlock(doc, {
          title: title || undefined,
          prefix: "● ",
          marginBefore: 0.4,
          marginAfter: 0.3,
          bullets: project.bullets,
          bulletPrefix: "- ",
          bulletSpacingAfter: 0,
          titleFontSize: SUBTITLE_FONT_SIZE,
          titleColor: BODY_COLOR,
        })
        if (index < optimized.projects.length - 1) {
          addVerticalSpace(doc, 0.6)
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

        addVerticalSpace(doc, 0.8)
        renderLine(doc, portfolioText, { color: FOOTNOTE_COLOR, marginBottom: 0 })
      }
    })
  }

  if (optimized.education && optimized.education.length) {
    renderSection("Education", () => {
      optimized.education.forEach((entry, index) => {
        const parts = [ensureAscii(entry.school), ensureAscii(entry.degree), ensureAscii(entry.dates)]
          .filter((value) => value && value.length > 0)
        if (parts.length) {
          renderLine(doc, parts.join(" - "), { marginBottom: index < optimized.education.length - 1 ? 0.3 : 0 })
        }
      })
    })
  }

  doc.end()
  return completion
}
