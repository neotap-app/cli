export type TaskStatus = "pending" | "running" | "succeeded" | "failed" | "canceled"

export type OpenapiTaskDoc = {
  type: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  inputExample?: unknown
  outputDescription?: string
  chargeable?: boolean
}

export type OpenapiDocs = {
  version: string
  tasks: OpenapiTaskDoc[]
}

export type TaskDetail = {
  id: string
  type: string
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

export type SubmitTaskResult = {
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
