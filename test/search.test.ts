import { describe, expect, it } from "vitest"
import { MAX_SEARCH_KEYWORDS, parseSearchKeywords } from "../src/lib/search.js"

describe("parseSearchKeywords", () => {
  it("supports repeated and comma-separated keywords", () => {
    expect(parseSearchKeywords([" image ", "sprite, game", ""])).toEqual(["image", "sprite", "game"])
  })

  it("allows up to the maximum number of keywords", () => {
    const keywords = Array.from({ length: MAX_SEARCH_KEYWORDS }, (_, index) => `keyword-${index}`)
    expect(parseSearchKeywords(keywords)).toHaveLength(MAX_SEARCH_KEYWORDS)
  })

  it("rejects more than the maximum number of keywords", () => {
    const keywords = Array.from({ length: MAX_SEARCH_KEYWORDS + 1 }, (_, index) => `keyword-${index}`)
    expect(() => parseSearchKeywords(keywords)).toThrow(`Maximum is ${MAX_SEARCH_KEYWORDS}`)
  })
})
