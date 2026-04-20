import { Users, Sparkles, Package, Swords } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

type Persona = {
  id: string;
  name: string;
  description: string | null;
  jobsToBeDone: string[];
  painPoints: string[];
  channels: string[];
  buyingTriggers: string[];
};

type ValueProp = {
  id: string;
  title: string;
  description: string | null;
  proof: string[];
};

type Product = {
  id: string;
  name: string;
  productType: string | null;
  description: string | null;
  useCases: string[];
  featuresBenefits: { feature: string; benefit: string }[];
  pricingModel: string | null;
  url: string | null;
};

type Competitor = {
  id: string;
  name: string;
  website: string | null;
  competitorType: 'direct' | 'indirect' | 'alternative' | null;
  howWeDiffer: string | null;
  threatLevel: 'low' | 'medium' | 'high' | null;
};

export function PersonasCard({ personas }: { personas: Persona[] }) {
  return (
    <Card>
      <CardHeader
        title="Audience personas"
        subtitle={`${personas.length} defined`}
      />
      <CardBody>
        {personas.length === 0 ? (
          <EmptyState
            icon={<Users className="h-4 w-4" />}
            title="No personas yet"
            description="Generate a brand profile — Claude will derive personas from your content."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {personas.map((p) => (
              <div
                key={p.id}
                className="rounded-md border border-stone-200 bg-white p-4"
              >
                <h4 className="text-sm font-semibold text-stone-900">{p.name}</h4>
                {p.description ? (
                  <p className="mt-1 text-sm leading-relaxed text-stone-700">{p.description}</p>
                ) : null}
                {p.jobsToBeDone.length ? (
                  <KVList label="Jobs to be done" items={p.jobsToBeDone} />
                ) : null}
                {p.painPoints.length ? (
                  <KVList label="Pain points" items={p.painPoints} />
                ) : null}
                {p.channels.length ? (
                  <div className="mt-2.5">
                    <FieldLabel>Channels</FieldLabel>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {p.channels.map((c, i) => (
                        <Badge key={i} tone="info">{c}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {p.buyingTriggers.length ? (
                  <KVList label="Buying triggers" items={p.buyingTriggers} />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function ValuePropsCard({ props }: { props: ValueProp[] }) {
  return (
    <Card>
      <CardHeader
        title="Value propositions"
        subtitle={`${props.length} defined`}
      />
      <CardBody>
        {props.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-4 w-4" />}
            title="No value propositions yet"
            description="Generate a brand profile to surface what you're selling."
          />
        ) : (
          <ol className="space-y-2">
            {props.map((v, i) => (
              <li
                key={v.id}
                className="flex gap-3 rounded-md border border-stone-200 bg-white p-3"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[11px] font-semibold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-stone-900">{v.title}</p>
                  {v.description ? (
                    <p className="mt-0.5 text-sm leading-relaxed text-stone-700">
                      {v.description}
                    </p>
                  ) : null}
                  {v.proof.length ? (
                    <ul className="mt-1.5 space-y-0.5">
                      {v.proof.map((pr, idx) => (
                        <li key={idx} className="flex gap-2 text-xs text-stone-600">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-stone-400" />
                          {pr}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

export function ProductsCard({ products }: { products: Product[] }) {
  if (products.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Products & services" subtitle={`${products.length} defined`} />
      <CardBody>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {products.map((p) => (
            <div key={p.id} className="rounded-md border border-stone-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-semibold text-stone-900">{p.name}</h4>
                {p.productType ? (
                  <Badge tone="neutral">{p.productType}</Badge>
                ) : null}
              </div>
              {p.description ? (
                <p className="mt-1 text-sm leading-relaxed text-stone-700">{p.description}</p>
              ) : null}
              {p.featuresBenefits.length ? (
                <div className="mt-2.5 space-y-1">
                  {p.featuresBenefits.map((fb, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium text-stone-900">{fb.feature}</span>
                      <span className="text-stone-400"> → </span>
                      <span className="text-stone-600">{fb.benefit}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {p.useCases.length ? (
                <KVList label="Use cases" items={p.useCases} />
              ) : null}
              {p.pricingModel ? (
                <p className="mt-2.5 text-xs text-stone-500">
                  <span className="font-medium uppercase tracking-wide">Pricing:</span>{' '}
                  {p.pricingModel}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

export function CompetitorsCard({ competitors }: { competitors: Competitor[] }) {
  if (competitors.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Competitors" subtitle={`${competitors.length} named`} />
      <CardBody>
        <ul className="divide-y divide-stone-200">
          {competitors.map((c) => (
            <li key={c.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-600">
                <Swords className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-stone-900">{c.name}</p>
                  {c.competitorType ? <Badge tone="neutral">{c.competitorType}</Badge> : null}
                  {c.threatLevel ? (
                    <Badge
                      tone={
                        c.threatLevel === 'high'
                          ? 'danger'
                          : c.threatLevel === 'medium'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {c.threatLevel} threat
                    </Badge>
                  ) : null}
                </div>
                {c.howWeDiffer ? (
                  <p className="mt-0.5 text-sm text-stone-700">{c.howWeDiffer}</p>
                ) : null}
                {c.website ? (
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-stone-500 underline hover:text-stone-900"
                  >
                    {c.website}
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function KVList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-2.5">
      <FieldLabel>{label}</FieldLabel>
      <ul className="mt-1 space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-xs text-stone-600">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-stone-400" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{children}</p>
  );
}
