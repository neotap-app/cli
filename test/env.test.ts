import { afterEach, describe, expect, it, vi } from "vitest"
import { isSandboxMode, resolveApiKey, resolveApiUrl, resolveWebUrl } from "../src/lib/env.js"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("sandbox mode", () => {
  it("is enabled by NEOTAP_CLI_SANDBOX_MODE", () => {
    vi.stubEnv("NEOTAP_CLI_SANDBOX_MODE", "true")
    expect(isSandboxMode()).toBe(true)
  })

  it("is enabled by the --sandbox flag", () => {
    expect(isSandboxMode({ sandbox: true })).toBe(true)
  })

  it("is disabled by default", () => {
    expect(isSandboxMode()).toBe(false)
  })
})

describe("resolveApiKey", () => {
  it("never returns a key in sandbox mode", () => {
    vi.stubEnv("NEOTAP_APIKEY", "nt_env")
    expect(resolveApiKey({ sandbox: true }, { apiKey: "nt_config" })).toBeUndefined()
  })

  it("prefers CLI option over env and config", () => {
    vi.stubEnv("NEOTAP_APIKEY", "nt_env")
    expect(resolveApiKey({ apikey: "nt_cli" }, { apiKey: "nt_config" })).toBe("nt_cli")
  })

  it("falls back to env then config", () => {
    vi.stubEnv("NEOTAP_APIKEY", "nt_env")
    expect(resolveApiKey({}, { apiKey: "nt_config" })).toBe("nt_env")
    vi.unstubAllEnvs()
    expect(resolveApiKey({}, { apiKey: "nt_config" })).toBe("nt_config")
  })
})

describe("endpoint resolution", () => {
  it("uses defaults when nothing is configured", () => {
    expect(resolveApiUrl()).toBe("https://api.neotap.app")
    expect(resolveWebUrl()).toBe("https://neotap.app")
  })

  it("prefers CLI options and removes trailing slashes", () => {
    expect(resolveApiUrl({ apiUrl: "http://localhost:3001/" })).toBe("http://localhost:3001")
    expect(resolveWebUrl({ webUrl: "http://localhost:3000/" })).toBe("http://localhost:3000")
  })

  it("reads environment overrides", () => {
    vi.stubEnv("NEOTAP_API_URL", "http://api.example.test/")
    expect(resolveApiUrl()).toBe("http://api.example.test")
  })
})
