declare module "pdfjs-dist/legacy/build/pdf" {
  export * from "pdfjs-dist"
  import * as pdfjs from "pdfjs-dist"
  export default pdfjs
}

declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  const worker: string
  export default worker
}
