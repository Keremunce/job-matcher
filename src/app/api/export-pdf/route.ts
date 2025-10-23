import { NextRequest, NextResponse } from "next/server"
import { ExportPdfSchema } from "@/types"
import { normalizeCandidateProfile } from "@/lib/normalizers"
import { createResumePdf } from "@/lib/pdf"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => null)
    if (!payload) {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 })
    }

    const parsed = ExportPdfSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid export payload.", details: parsed.error.format() }, { status: 422 })
    }

    const normalizedProfile = normalizeCandidateProfile(parsed.data.candidateProfile)
    const pdfBuffer = await createResumePdf(normalizedProfile, parsed.data.matchOutput, {
      includeCoverLetter: true,
    })

    const responseHeaders = new Headers({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="specmatch-resume.pdf"`,
      "Content-Length": String(pdfBuffer.byteLength),
      "Cache-Control": "no-store",
    })

    return new Response(new Uint8Array(pdfBuffer).buffer, {
      status: 200,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error("[api/export-pdf] error", error)
    return NextResponse.json(
      {
        error: "Failed to generate resume PDF.",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    )
  }
}
