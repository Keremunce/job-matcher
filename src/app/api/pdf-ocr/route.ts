import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const PDFCO_ENDPOINT = "https://api.pdf.co/v1/pdf/convert/to/text"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file")

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing PDF file." }, { status: 400 })
    }

    const apiKey = process.env.PDFCO_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "PDFCO_KEY is not configured." }, { status: 500 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString("base64")

    const response = await fetch(PDFCO_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        url: `data:application/pdf;base64,${base64}`,
        inline: true,
        async: false,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      return NextResponse.json(
        { error: "PDF.co request failed.", details: errorBody.slice(0, 500) },
        { status: 502 },
      )
    }

    const payload = (await response.json()) as {
      error?: boolean
      message?: string
      body?: string
      text?: string
    }

    if (payload.error) {
      return NextResponse.json(
        { error: payload.message ?? "PDF.co reported an error." },
        { status: 502 },
      )
    }

    const text = (payload.text ?? payload.body ?? "").trim()

    if (!text) {
      return NextResponse.json(
        { error: "PDF.co returned empty OCR result." },
        { status: 502 },
      )
    }

    return NextResponse.json({ text })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OCR error."
    return NextResponse.json(
      { error: "Failed to perform OCR.", details: message },
      { status: 500 },
    )
  }
}
