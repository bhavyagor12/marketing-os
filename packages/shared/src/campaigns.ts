import { z } from 'zod';
import { platformSchema, contentTypeSchema } from './platforms';

export const campaignStatusSchema = z.enum(['draft', 'active', 'paused', 'archived']);
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

export const campaignBriefSchema = z.object({
  goal: z.string().min(1),
  product: z.string().min(1),
  audience: z.string().min(1),
  platforms: z.array(platformSchema).min(1),
  timeline: z.string().optional(),
  toneOverrides: z.string().optional(),
  constraints: z.array(z.string()).default([]),
});
export type CampaignBrief = z.infer<typeof campaignBriefSchema>;

export const campaignPlanItemSchema = z.object({
  platform: platformSchema,
  contentType: contentTypeSchema,
  angle: z.string(),
  hook: z.string(),
  cta: z.string().optional(),
  scheduledDayOffset: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});
export type CampaignPlanItem = z.infer<typeof campaignPlanItemSchema>;

export const campaignPlanSchema = z.object({
  title: z.string(),
  objective: z.string(),
  channels: z.array(platformSchema).min(1),
  posts: z.array(campaignPlanItemSchema).min(1),
  kpis: z.array(z.string()).default([]),
});
export type CampaignPlan = z.infer<typeof campaignPlanSchema>;
