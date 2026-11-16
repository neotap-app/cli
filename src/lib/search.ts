import { UsageError } from "./errors.js"

export const MAX_SEARCH_KEYWORDS = 8

export function parseSearchKeywords(values: string[]): string[] {
  const keywords = values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)

  if (keywords.length > MAX_SEARCH_KEYWORDS) {
    throw new UsageError(
      `Too many search keywords: ${keywords.length}. Maximum is ${MAX_SEARCH_KEYWORDS}.`,
    )
  }

  return keywords
}
