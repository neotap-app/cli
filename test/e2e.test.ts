import { describe, expect, it } from "vitest"
import { ApiClient } from "../src/lib/http.js"
import type { AuthMe, WorkflowDetail, WorkflowListResult } from "../src/lib/types.js"

// 可选的真实后端契约测试：
//   NEOTAP_E2E_API_URL=http://localhost:3001 NEOTAP_E2E_APIKEY=nt_xxx npm run test:e2e
const apiUrl = process.env.NEOTAP_E2E_API_URL
const apiKey = process.env.NEOTAP_E2E_APIKEY

describe.skipIf(!apiUrl)("live NeoTap backend", () => {
  const client = new ApiClient({ baseUrl: apiUrl ?? "" })

  it("serves public workflow list", async () => {
    const result = await client.get<WorkflowListResult>("/openapi/workflows")
    expect(typeof result.total).toBe("number")
    expect(Array.isArray(result.list)).toBe(true)
    expect(result.list.length).toBeGreaterThan(0)
    expect(result.list[0]?.priceDescription).toBeTruthy()
  })

  it("serves a single workflow detail", async () => {
    const result = await client.get<WorkflowListResult>("/openapi/workflows")
    const id = result.list[0]!.id
    const workflow = await client.get<WorkflowDetail>(`/openapi/workflows/${encodeURIComponent(id)}`)
    expect(workflow.id).toBe(id)
    expect(workflow.inputSchema).toBeTruthy()
    expect(workflow.outputSchema).toBeTruthy()
  })

  it.runIf(Boolean(apiKey))("validates an API key via /openapi/auth/me", async () => {
    const authed = new ApiClient({ baseUrl: apiUrl ?? "", apiKey })
    const me = await authed.get<AuthMe>("/openapi/auth/me")
    expect(me.keyId).toBeTruthy()
    expect(me.type).toBeTruthy()
  })
})
