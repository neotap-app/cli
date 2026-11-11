import { describe, expect, it } from "vitest"
import { formatDate } from "../src/lib/output.js"

describe("formatDate", () => {
  it("formats timestamps in local time", () => {
    expect(formatDate(new Date(2026, 0, 2, 3, 4, 5))).toBe("2026-01-02 03:04:05")
  })

  it("formats parseable strings locally", () => {
    const date = new Date(2026, 10, 11, 23, 59, 58)
    expect(formatDate(date.toISOString())).toBe("2026-11-11 23:59:58")
  })

  it("keeps empty and invalid values readable", () => {
    expect(formatDate(undefined)).toBe("-")
    expect(formatDate("not-a-date")).toBe("not-a-date")
  })
})
