import { describe, expect, it } from "vitest"
import { ApiClient } from "../src/lib/http.js"
import type { AuthMe, ModelDetail, ModelListResult } from "../src/lib/types.js"

// 可选的真实后端契约测试：
//   NEOTAP_E2E_API_URL=http://localhost:3001 NEOTAP_E2E_APIKEY=nt_xxx npm run test:e2e
const apiUrl = process.env.NEOTAP_E2E_API_URL
const apiKey = process.env.NEOTAP_E2E_APIKEY

describe.skipIf(!apiUrl)("live NeoTap backend", () => {
  const client = new ApiClient({ baseUrl: apiUrl ?? "" })

  it("serves public model list", async () => {
    const result = await client.get<ModelListResult>("/openapi/models")
    expect(typeof result.total).toBe("number")
    expect(Array.isArray(result.list)).toBe(true)
    expect(result.list.length).toBeGreaterThan(0)
    expect(result.list[0]?.priceDescription).toBeTruthy()
  })

  it("serves a single model detail", async () => {
    const result = await client.get<ModelListResult>("/openapi/models")
    const id = result.list[0]!.id
    const model = await client.get<ModelDetail>(`/openapi/models/${encodeURIComponent(id)}`)
    expect(model.id).toBe(id)
    expect(model.inputSchema).toBeTruthy()
    expect(model.outputSchema).toBeTruthy()
  })

  it.runIf(Boolean(apiKey))("validates an API key via /openapi/auth/me", async () => {
    const authed = new ApiClient({ baseUrl: apiUrl ?? "", apiKey })
    const me = await authed.get<AuthMe>("/openapi/auth/me")
    expect(me.keyId).toBeTruthy()
    expect(me.type).toBeTruthy()
  })
})
