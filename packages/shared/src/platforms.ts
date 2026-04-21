import { z } from 'zod';

export const platformSchema = z.enum(['x', 'linkedin', 'instagram', 'facebook', 'email']);
export type Platform = z.infer<typeof platformSchema>;

export const contentTypeSchema = z.enum([
  'text_post',
  'thread',
  'image',
  'video',
  'email',
  'carousel',
]);
export type ContentType = z.infer<typeof contentTypeSchema>;

export const aiProviderSchema = z.enum(['anthropic', 'openai', 'google', 'voyage']);
export type AiProvider = z.infer<typeof aiProviderSchema>;

export const billingSourceSchema = z.enum(['byo_key', 'managed']);
export type BillingSource = z.infer<typeof billingSourceSchema>;
