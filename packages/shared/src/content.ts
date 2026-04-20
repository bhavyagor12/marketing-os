import { z } from 'zod';

export const textPostPayloadSchema = z.object({
  kind: z.literal('text_post'),
  body: z.string().min(1),
});

export const threadPayloadSchema = z.object({
  kind: z.literal('thread'),
  items: z.array(z.object({ body: z.string().min(1) })).min(1),
});

export const imagePayloadSchema = z.object({
  kind: z.literal('image'),
  caption: z.string(),
  blobIds: z.array(z.string().uuid()).min(1),
});

export const videoPayloadSchema = z.object({
  kind: z.literal('video'),
  caption: z.string(),
  blobId: z.string().uuid(),
});

export const emailPayloadSchema = z.object({
  kind: z.literal('email'),
  subject: z.string().min(1),
  preheader: z.string().optional(),
  bodyMarkdown: z.string().min(1),
});

export const carouselPayloadSchema = z.object({
  kind: z.literal('carousel'),
  slides: z
    .array(
      z.object({
        blobId: z.string().uuid(),
        caption: z.string().optional(),
      }),
    )
    .min(2),
});

export const assetPayloadSchema = z.discriminatedUnion('kind', [
  textPostPayloadSchema,
  threadPayloadSchema,
  imagePayloadSchema,
  videoPayloadSchema,
  emailPayloadSchema,
  carouselPayloadSchema,
]);
export type AssetPayload = z.infer<typeof assetPayloadSchema>;

export const commitMessageSchema = z.string().max(500);
