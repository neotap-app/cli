import { describe, expect, it } from "vitest"
import { normalizeArgv } from "../src/lib/argv.js"

describe("normalizeArgv", () => {
  it("maps underscore aliases to hyphenated flags", () => {
    expect(normalizeArgv(["task", "list", "--apikey_id", "123", "--page_size=5"])).toEqual([
      "task",
      "list",
      "--apikey-id",
      "123",
      "--page-size=5",
    ])
  })

  it("leaves other arguments untouched", () => {
    expect(normalizeArgv(["task", "submit", "--type", "sprites-1"])).toEqual([
      "task",
      "submit",
      "--type",
      "sprites-1",
    ])
  })
})
