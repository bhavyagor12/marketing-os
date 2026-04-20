import { z } from 'zod';

export const agentKindSchema = z.enum([
  'research',
  'persona',
  'planner',
  'content',
  'creative',
  'email',
  'analytics',
  'optimizer',
]);
export type AgentKind = z.infer<typeof agentKindSchema>;

export const agentRunStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const publishStatusSchema = z.enum([
  'pending',
  'publishing',
  'published',
  'failed',
  'cancelled',
]);
export type PublishStatus = z.infer<typeof publishStatusSchema>;

export const approvalStatusSchema = z.enum([
  'requested',
  'approved',
  'changes_requested',
  'dismissed',
]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;
