export type TaskStatus = "pending" | "running" | "succeeded" | "failed" | "canceled"

export type OpenapiCatalog = {
  id: string
  name: string
}

export type ModelSummary = {
  id: string
  name: string
  description: string
  catalogs: OpenapiCatalog[]
  providerName: string
  priceDescription: string
}

export type ModelDetail = ModelSummary & {
  inputSchema: Record<string, unknown>
  inputExample?: unknown
  outputSchema: Record<string, unknown>
  outputExample?: unknown
  outputDescription?: string
}

export type ModelListResult = {
  list: ModelSummary[]
  total: number
  page: number
  pageSize: number
}

export type CatalogListResult = {
  list: OpenapiCatalog[]
}

export type TaskDetail = {
  id: string
  modelId: string
  status: TaskStatus
  apiKeyId?: string
  studioProjectId?: string
  output?: unknown
  error?: string
  createdAt?: string
  updatedAt?: string
  finishedAt?: string
}

export type TaskListResult = {
  list: TaskDetail[]
  nextCursor: string | null
}

export type CreateTaskResult = {
  id: string
  status: TaskStatus
}

export type CliAuthStartResult = {
  deviceCode: string
  userCode: string
  verificationUrl: string
  interval: number
  expiresIn: number
}

export type CliAuthPollResult =
  | { status: "pending"; interval: number; expiresAt: string }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "consumed" }
  | { status: "approved"; apiKey: string; apiKeyId: string; keyName: string; userId: string }

export type AuthMe = {
  keyId: string
  userId: string | null
  type: string
  key: {
    id: string
    name: string
    type: string
    status: string
    lastUsedAt?: string
    createdAt?: string
  } | null
}
