"use client"

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf")
type PdfDocumentParams = Parameters<PdfJsModule["getDocument"]>[0]
type TextItem = { str?: string }

let pdfjsModulePromise: Promise<PdfJsModule> | null = null
let workerConfigured = false

const loadPdfjs = async () => {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import("pdfjs-dist/legacy/build/pdf")
  }
  return pdfjsModulePromise
}

const ensureWorker = async (pdfjsLib: PdfJsModule) => {
  if (workerConfigured || typeof window === "undefined") {
    return
  }

  try {
    const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.mjs")
    const workerSrc = (workerModule as { default?: unknown }).default ?? workerModule

    if (typeof workerSrc === "string") {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc
    } else if (workerSrc && typeof (workerSrc as { url?: string }).url === "string") {
      pdfjsLib.GlobalWorkerOptions.workerSrc = (workerSrc as { url: string }).url
    } else {
      pdfjsLib.GlobalWorkerOptions.workerSrc = ""
    }
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = ""
  }

  workerConfigured = true
}

export const extractPdfText = async (file: File) => {
  if (!(file instanceof File)) {
    throw new Error("Invalid file provided for PDF extraction.")
  }

  const pdfjsLib = await loadPdfjs()
  await ensureWorker(pdfjsLib)

  const buffer = await file.arrayBuffer()
  const data = new Uint8Array(buffer)

  const useWorker =
    typeof window !== "undefined" && Boolean(pdfjsLib.GlobalWorkerOptions.workerSrc?.toString().trim())

  const params = {
    data,
    disableFontFace: true,
    useSystemFonts: true,
    disableWorker: !useWorker,
  } as PdfDocumentParams

  const loadingTask = pdfjsLib.getDocument(params)

  const pdfDocument = await loadingTask.promise

  try {
    const parts: string[] = []

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = (content.items as TextItem[])
        .map((item) => (typeof item.str === "string" ? item.str : ""))
        .filter(Boolean)
        .join(" ")

      if (pageText) {
        parts.push(pageText)
      }
    }

    return parts.join("\n").trim()
  } finally {
    pdfDocument.cleanup()
    pdfDocument.destroy()
  }
}
