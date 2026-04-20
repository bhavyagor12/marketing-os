import { eq, desc, asc, sql } from 'drizzle-orm';
import {
  db,
  brandIngestionSources,
  brandProfiles,
  brandMemory,
  brandAssets,
  brandPersonas,
  brandValuePropositions,
  brandProducts,
  brandCompetitors,
} from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { requireOrgSession } from '@/lib/require-session';
import { AddWebsiteForm } from './AddWebsiteForm';
import { UploadPdfForm } from './UploadPdfForm';
import { SourcesList } from './SourcesList';
import { BrandProfileCard } from './BrandProfileCard';
import { AssetsGallery } from './AssetsGallery';
import {
  PersonasCard,
  ValuePropsCard,
  ProductsCard,
  CompetitorsCard,
} from './BrandEntitiesPanels';

export default async function BrandPage() {
  const { activeOrgId } = await requireOrgSession();

  const sources = await db
    .select()
    .from(brandIngestionSources)
    .where(eq(brandIngestionSources.organizationId, activeOrgId))
    .orderBy(desc(brandIngestionSources.createdAt))
    .limit(50);

  const [stats] = await db
    .select({
      completed: sql<number>`count(*) filter (where ${brandIngestionSources.status} = 'completed')`.mapWith(
        Number,
      ),
      chunkTotal: sql<number>`coalesce(sum(${brandIngestionSources.chunkCount}), 0)`.mapWith(
        Number,
      ),
    })
    .from(brandIngestionSources)
    .where(eq(brandIngestionSources.organizationId, activeOrgId));

  const [memStats] = await db
    .select({
      chars: sql<number>`coalesce(sum(length(${brandMemory.content})), 0)`.mapWith(Number),
    })
    .from(brandMemory)
    .where(eq(brandMemory.organizationId, activeOrgId));

  const [profile] = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.organizationId, activeOrgId))
    .limit(1);

  const orgAssets = await db
    .select()
    .from(brandAssets)
    .where(eq(brandAssets.organizationId, activeOrgId))
    .orderBy(desc(brandAssets.prominence))
    .limit(60);

  const personas = await db
    .select()
    .from(brandPersonas)
    .where(eq(brandPersonas.organizationId, activeOrgId))
    .orderBy(asc(brandPersonas.rank));

  const valueProps = await db
    .select()
    .from(brandValuePropositions)
    .where(eq(brandValuePropositions.organizationId, activeOrgId))
    .orderBy(asc(brandValuePropositions.rank));

  const products = await db
    .select()
    .from(brandProducts)
    .where(eq(brandProducts.organizationId, activeOrgId))
    .orderBy(asc(brandProducts.rank));

  const competitors = await db
    .select()
    .from(brandCompetitors)
    .where(eq(brandCompetitors.organizationId, activeOrgId))
    .orderBy(desc(brandCompetitors.createdAt));

  const completedCount = stats?.completed ?? 0;
  const chunkTotal = stats?.chunkTotal ?? 0;
  const charsTotal = memStats?.chars ?? 0;

  const topImages = orgAssets
    .filter((a) => ['image', 'logo', 'favicon', 'og_image'].includes(a.kind))
    .slice(0, 12) as never;
  const topColors = dedupeBy(
    orgAssets.filter((a) => a.kind === 'color'),
    (a) => a.hex ?? '',
  ).slice(0, 12) as never;
  const topFonts = dedupeBy(
    orgAssets.filter((a) => a.kind === 'font'),
    (a) => a.fontFamily ?? '',
  ).slice(0, 8) as never;
  const hasAssets =
    (topImages as unknown as unknown[]).length +
      (topColors as unknown as unknown[]).length +
      (topFonts as unknown as unknown[]).length >
    0;

  const subtitle = chunkTotal
    ? `${completedCount} source${completedCount === 1 ? '' : 's'} · ${chunkTotal.toLocaleString()} chunks · ${charsTotal.toLocaleString()} chars`
    : 'Teach Marketing OS who you are, who you serve, what you sell, how you sound, and where you stand.';

  return (
    <>
      <PageHeader title="Brand" subtitle={subtitle} />
      <PageBody>
        <div className="space-y-6">
          {/* Top row: ingestion inputs + sources */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader
                title="Scan a website"
                subtitle="Crawls the root + same-origin pages."
              />
              <CardBody>
                <AddWebsiteForm />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Upload PDFs" subtitle="Brand guidelines, decks, tone docs." />
              <CardBody>
                <UploadPdfForm />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Sources"
                subtitle={`${sources.length} total · click to inspect`}
              />
              <SourcesList initial={sources as never} />
            </Card>
          </div>

          {/* Brand book — the main thing */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <Card>
                <BrandProfileCard
                  profile={(profile as never) ?? null}
                  completedSourceCount={completedCount}
                />
              </Card>
            </div>
            {hasAssets ? (
              <Card>
                <CardHeader
                  title="Visual identity"
                  subtitle="Pulled from your sources."
                />
                <CardBody>
                  <AssetsGallery
                    images={topImages}
                    colors={topColors}
                    fonts={topFonts}
                  />
                </CardBody>
              </Card>
            ) : null}
          </div>

          <PersonasCard personas={personas as never} />
          <ValuePropsCard props={valueProps as never} />
          <ProductsCard products={products as never} />
          <CompetitorsCard competitors={competitors as never} />
        </div>
      </PageBody>
    </>
  );
}

function dedupeBy<T>(arr: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
