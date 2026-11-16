export type TaskStatus = "pending" | "running" | "succeeded" | "failed" | "canceled"
export type TargetKind = "model" | "workflow"

export type OpenapiCatalog = {
  id: string
  name: string
}

export type OpenapiTargetSummary = {
  id: string
  name: string
  description: string
  catalogs: OpenapiCatalog[]
  providerName: string
  priceDescription: string
}

export type OpenapiTargetDetail = OpenapiTargetSummary & {
  inputSchema: Record<string, unknown>
  inputExample?: unknown
  outputSchema: Record<string, unknown>
  outputExample?: unknown
}

export type OpenapiTargetListResult = {
  list: OpenapiTargetSummary[]
  total: number
  page: number
  pageSize: number
}

export type ModelSummary = OpenapiTargetSummary
export type ModelDetail = OpenapiTargetDetail
export type ModelListResult = OpenapiTargetListResult
export type WorkflowSummary = OpenapiTargetSummary
export type WorkflowDetail = OpenapiTargetDetail
export type WorkflowListResult = OpenapiTargetListResult

export type CatalogListResult = {
  list: OpenapiCatalog[]
}

export type TaskDetail = {
  id: string
  targetKind: TargetKind
  targetId: string
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
  targetKind: TargetKind
  targetId: string
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
