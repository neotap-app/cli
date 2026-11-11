import { describe, expect, it } from "vitest"
import { ApiClient } from "../src/lib/http.js"
import type { AuthMe, OpenapiDocs } from "../src/lib/types.js"

// 可选的真实后端契约测试：
//   NEOTAP_E2E_API_URL=http://localhost:3001 NEOTAP_E2E_APIKEY=nt_xxx npm run test:e2e
const apiUrl = process.env.NEOTAP_E2E_API_URL
const apiKey = process.env.NEOTAP_E2E_APIKEY

describe.skipIf(!apiUrl)("live NeoTap backend", () => {
  const client = new ApiClient({ baseUrl: apiUrl ?? "" })

  it("serves public OpenAPI docs", async () => {
    const docs = await client.get<OpenapiDocs>("/openapi/docs")
    expect(docs.version).toBeTruthy()
    expect(Array.isArray(docs.tasks)).toBe(true)
    expect(docs.tasks.length).toBeGreaterThan(0)
    expect(docs.tasks[0]?.inputSchema).toBeTruthy()
  })

  it("serves a single task type doc", async () => {
    const docs = await client.get<OpenapiDocs>("/openapi/docs")
    const type = docs.tasks[0]!.type
    const doc = await client.get<{ type: string }>(`/openapi/docs/${encodeURIComponent(type)}`)
    expect(doc.type).toBe(type)
  })

  it.runIf(Boolean(apiKey))("validates an API key via /openapi/auth/me", async () => {
    const authed = new ApiClient({ baseUrl: apiUrl ?? "", apiKey })
    const me = await authed.get<AuthMe>("/openapi/auth/me")
    expect(me.keyId).toBeTruthy()
    expect(me.type).toBeTruthy()
  })
})
