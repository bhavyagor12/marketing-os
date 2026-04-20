import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

export const s3 = new S3Client({
  region: process.env.S3_REGION ?? 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
});

export const S3_BUCKET = process.env.S3_BUCKET ?? 'marketing-os-media';

export async function downloadBlob(key: string): Promise<Uint8Array> {
  const res = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  const stream = res.Body as ReadableStream<Uint8Array> | undefined;
  if (!stream) throw new Error(`no body for s3 object ${key}`);
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export async function uploadBlob(params: {
  key: string;
  body: Uint8Array | Buffer;
  contentType: string;
}) {
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
}
