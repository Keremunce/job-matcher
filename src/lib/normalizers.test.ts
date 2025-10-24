import { composeContact, sanitizeProjectTitle, stripNameFromSummary } from "./normalizers"

declare const describe: (name: string, fn: () => void) => void
declare const it: (name: string, fn: () => void) => void
declare const expect: (value: unknown) => any

describe("normalizer helpers", () => {
  it("sanitizes project titles by removing parentheses and normalizing separators", () => {
    const result = sanitizeProjectTitle("How to Draw (iOS) - Step-by-step")
    expect(result).toBe("How to Draw - Step-by-step")
  })

  it("strips candidate name from summary content", () => {
    const result = stripNameFromSummary("KEREM UNCE — designer focusing on workflows", "KEREM UNCE")
    expect(result).not.toMatch(/KEREM\s+UNCE/i)
  })

  it("composes contact lines without duplicate separators and includes Behance", () => {
    const contact = composeContact({
      email: "info@example.com",
      behance: "https://behance.net/keremnce",
    })

    expect(contact.top).toBe("info@example.com | https://behance.net/keremnce")
    expect(contact.top.includes("||")).toBe(false)
  })
})
