import fs from "node:fs"

import { BUNDLED_FONT_PATH } from "./pdf"

declare const describe: (name: string, fn: () => void) => void
declare const it: (name: string, fn: () => void) => void
declare const expect: (value: unknown) => any

describe("pdf generator font setup", () => {
  it("bundled font file exists for PDFKit registration", () => {
    expect(fs.existsSync(BUNDLED_FONT_PATH)).toBe(true)
  })
})
