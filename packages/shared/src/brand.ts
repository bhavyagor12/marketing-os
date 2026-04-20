import { z } from 'zod';

export const personaSchema = z.object({
  name: z.string(),
  description: z.string(),
  painPoints: z.array(z.string()).default([]),
  channels: z.array(z.string()).default([]),
});
export type Persona = z.infer<typeof personaSchema>;

export const brandVoiceToneSchema = z.object({
  attributes: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
});
export type BrandVoiceTone = z.infer<typeof brandVoiceToneSchema>;

export const brandMemorySourceSchema = z.enum([
  'website',
  'past_post',
  'brand_guideline',
  'tone_doc',
  'founder_note',
  'competitor',
  'manual',
]);
export type BrandMemorySource = z.infer<typeof brandMemorySourceSchema>;
