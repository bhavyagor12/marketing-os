import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq, asc } from 'drizzle-orm';
import {
  ArrowLeft,
  Globe,
  FileText,
  ExternalLink,
  Clock,
  Hash,
  AlertTriangle,
} from 'lucide-react';
import { db, brandIngestionSources, brandMemory, brandAssets } from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { requireOrgSession } from '@/lib/require-session';
import { AssetsGallery } from '../../AssetsGallery';

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { activeOrgId } = await requireOrgSession();

  const [source] = await db
    .select()
    .from(brandIngestionSources)
    .where(
      and(
        eq(brandIngestionSources.id, id),
        eq(brandIngestionSources.organizationId, activeOrgId),
      ),
    )
    .limit(1);

  if (!source) notFound();

  const chunks = await db
    .select({
      id: brandMemory.id,
      title: brandMemory.title,
      sourceUrl: brandMemory.sourceUrl,
      content: brandMemory.content,
      chunkIndex: brandMemory.chunkIndex,
      createdAt: brandMemory.createdAt,
    })
    .from(brandMemory)
    .where(eq(brandMemory.sourceId, id))
    .orderBy(asc(brandMemory.chunkIndex));

  const assets = await db
    .select()
    .from(brandAssets)
    .where(eq(brandAssets.sourceId, id));

  const images = assets
    .filter((a) => ['image', 'logo', 'favicon', 'og_image'].includes(a.kind))
    .sort((a, b) => b.prominence - a.prominence) as never;
  const colors = assets
    .filter((a) => a.kind === 'color')
    .sort((a, b) => b.prominence - a.prominence) as never;
  const fonts = assets.filter((a) => a.kind === 'font') as never;

  // Group chunks by page (source_url) for website sources.
  const grouped = new Map<string, typeof chunks>();
  for (const c of chunks) {
    const key = c.sourceUrl ?? '';
    const arr = grouped.get(key) ?? [];
    arr.push(c);
    grouped.set(key, arr);
  }

  const sourceLabel = source.kind === 'website' ? source.url : source.filename;
  const totalChars = chunks.reduce((n, c) => n + c.content.length, 0);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {source.kind === 'website' ? (
              <Globe className="h-5 w-5 text-stone-400" />
            ) : (
              <FileText className="h-5 w-5 text-stone-400" />
            )}
            <span className="truncate">{sourceLabel}</span>
          </span>
        }
        subtitle={`${chunks.length} chunk${chunks.length === 1 ? '' : 's'} · ${totalChars.toLocaleString()} chars · ${source.pageCount || 1} page${source.pageCount === 1 ? '' : 's'}`}
        actions={
          <Link href="/dashboard/brand">
            <Button variant="secondary" size="sm" leadingIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
              Back to Brand
            </Button>
          </Link>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader title="Source" />
              <CardBody className="space-y-3 text-sm">
                <MetaRow
                  icon={source.kind === 'website' ? <Globe className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                  label="Type"
                  value={source.kind === 'website' ? 'Website' : 'PDF'}
                />
                <MetaRow
                  icon={<Hash className="h-3.5 w-3.5" />}
                  label="Status"
                  value={<StatusBadge status={source.status} />}
                />
                <MetaRow
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Added"
                  value={new Date(source.createdAt).toLocaleString()}
                />
                {source.kind === 'website' && source.url ? (
                  <div className="pt-2">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-stone-600 underline hover:text-stone-900"
                    >
                      Open original
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ) : null}
                {source.error ? (
                  <div className="mt-3 flex gap-2 rounded-md border border-red-200 bg-red-50 p-2.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                    <p className="text-xs text-red-700">{source.error}</p>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          </div>

          <div className="space-y-5 lg:col-span-3">
            {(assets as unknown as unknown[]).length > 0 ? (
              <Card>
                <CardHeader
                  title="Visual identity"
                  subtitle="Images, colors, and typography extracted from the source."
                />
                <CardBody>
                  <AssetsGallery images={images} colors={colors} fonts={fonts} />
                </CardBody>
              </Card>
            ) : null}

            {chunks.length === 0 ? (
              <Card>
                <CardBody>
                  <EmptyState
                    icon={<FileText className="h-4 w-4" />}
                    title={source.status === 'completed' ? 'No chunks extracted' : 'Nothing to show yet'}
                    description={
                      source.status === 'completed'
                        ? 'The crawl finished but no readable text was found on this source.'
                        : 'Chunks appear here once processing completes.'
                    }
                  />
                </CardBody>
              </Card>
            ) : source.kind === 'website' && grouped.size > 1 ? (
              Array.from(grouped.entries()).map(([pageUrl, pageChunks], pi) => (
                <Card key={pageUrl || pi}>
                  <CardHeader
                    title={
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{pageChunks[0]?.title || 'Untitled page'}</span>
                      </span>
                    }
                    subtitle={
                      <span className="flex items-center gap-2 text-stone-500">
                        <span className="truncate font-mono text-[11px]">{pageUrl}</span>
                        <span>·</span>
                        <span>{pageChunks.length} chunk{pageChunks.length === 1 ? '' : 's'}</span>
                      </span>
                    }
                    action={
                      pageUrl ? (
                        <a
                          href={pageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-stone-400 transition hover:text-stone-700"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null
                    }
                  />
                  <CardBody className="space-y-4">
                    {pageChunks.map((chunk) => (
                      <ChunkBlock
                        key={chunk.id}
                        index={chunk.chunkIndex}
                        content={chunk.content}
                      />
                    ))}
                  </CardBody>
                </Card>
              ))
            ) : (
              <Card>
                <CardHeader
                  title="Extracted content"
                  subtitle={`${chunks.length} chunk${chunks.length === 1 ? '' : 's'}`}
                />
                <CardBody className="space-y-4">
                  {chunks.map((chunk) => (
                    <ChunkBlock
                      key={chunk.id}
                      index={chunk.chunkIndex}
                      content={chunk.content}
                    />
                  ))}
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-500">
        {icon}
      </span>
      <span className="text-xs uppercase tracking-wide text-stone-500">{label}</span>
      <span className="ml-auto text-sm text-stone-900">{value}</span>
    </div>
  );
}

function ChunkBlock({ index, content }: { index: number; content: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50/60">
      <div className="flex items-center justify-between border-b border-stone-200 bg-white px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-stone-500">
          <Hash className="h-3 w-3" />
          Chunk {index + 1}
        </span>
        <span className="text-xs text-stone-400">{content.length.toLocaleString()} chars</span>
      </div>
      <pre className="whitespace-pre-wrap break-words px-4 py-3 font-sans text-sm leading-relaxed text-stone-800">
        {content}
      </pre>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') return <Badge tone="success" dot>Ready</Badge>;
  if (status === 'failed') return <Badge tone="danger" dot>Failed</Badge>;
  if (status === 'processing') return <Badge tone="info" dot>Processing</Badge>;
  return <Badge tone="neutral" dot>Queued</Badge>;
}
