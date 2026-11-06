import { z } from 'zod'

export const recallGateConfigSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.enum(['shadow', 'actual']).default('shadow'),
  gateVersion: z.string().min(1).default('f2-v1'),
  minSignals: z.number().int().min(0).max(3).default(1),
  supportRatio: z.number().min(0).max(1).default(0.4),
  minScore: z.number().min(0).max(1).default(0.25),
  nonBoundCharBudget: z.number().int().min(0).default(4000),
  auditLimit: z.number().int().min(1).max(10_000).default(200),
  auditRetentionDays: z.number().int().min(1).max(3650).default(30),
}).prefault({})

export const hostConfigSchema = z.object({
  recallGate: recallGateConfigSchema,
}).prefault({})

export const agentConfigSchema = z.object({
  autoContext: z.boolean().default(true),
  artifacts: z.object({
    enabled: z.boolean().default(true),
    maxObservations: z.number().int().min(1).max(500).default(500),
  }).prefault({}),
}).prefault({})

export type HostConfig = z.infer<typeof hostConfigSchema>
export type AgentConfig = z.infer<typeof agentConfigSchema>
export type RecallGateConfig = z.infer<typeof recallGateConfigSchema>

export const DEFAULT_HOST_CONFIG = hostConfigSchema.parse({})
export const DEFAULT_AGENT_CONFIG = agentConfigSchema.parse({})
