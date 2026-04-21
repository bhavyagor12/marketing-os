'use client';

import { useTransition } from 'react';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CardBody, CardHeader } from '@/components/ui/Card';
import { generateBrandProfile } from './actions';
import { EditIdentityCard } from './EditIdentityCard';
import { EditVoiceCard } from './EditVoiceCard';

type Identity = {
  tradingName?: string;
  tagline?: string;
  mission?: string;
  vision?: string;
  category?: string;
  subCategory?: string;
  stage?: string;
  hqLocation?: string;
  markets?: string[];
  foundedYear?: number;
  foundingStory?: string;
};

type Positioning = {
  category?: string;
  categoryPosition?: string;
  pointOfView?: string;
  uniqueInsight?: string;
  differentiators?: string[];
  elevatorPitch?: string;
};

type Voice = {
  attributes?: string[];
  avoid?: string[];
  signaturePhrases?: string[];
  lexicon?: { preferred: string; instead_of?: string }[];
  styleNotes?: string;
  examples?: { label: string; text: string }[];
  pointOfView?: string;
};

type Strategy = {
  currentPriorities?: string[];
  growthAudiences?: string[];
  focusChannels?: string[];
  upcomingLaunches?: string[];
};

type Constraints = {
  bannedPhrases?: string[];
  requiredDisclosures?: string[];
  compliance?: string[];
  trademarkedTerms?: string[];
  languages?: string[];
};

type Profile = {
  identity: Identity | null;
  positioning: Positioning | null;
  voice: Voice | null;
  strategy: Strategy | null;
  constraints: Constraints | null;
  updatedAt: Date | string;
} | null;

export function BrandProfileCard({
  profile,
  completedSourceCount,
}: {
  profile: Profile;
  completedSourceCount: number;
}) {
  const [pending, start] = useTransition();
  const ready = completedSourceCount > 0;
  const hasProfile = Boolean(
    profile?.identity?.mission ||
      profile?.identity?.tagline ||
      profile?.voice?.attributes?.length,
  );

  return (
    <>
      <CardHeader
        title="Brand profile"
        subtitle="Structured across identity, positioning, voice, strategy, and constraints."
        action={
          <Button
            size="sm"
            variant={hasProfile ? 'secondary' : 'primary'}
            disabled={!ready || pending}
            leadingIcon={<Wand2 className="h-3.5 w-3.5" />}
            onClick={() =>
              start(async () => {
                await generateBrandProfile();
              })
            }
          >
            {pending ? 'Generating…' : hasProfile ? 'Regenerate' : 'Generate profile'}
          </Button>
        }
      />
      <CardBody>
        {!hasProfile ? (
          <p className="mb-5 text-sm text-stone-500">
            {ready
              ? 'Generate to have Claude distill your sources into a full brand profile — or edit each section manually below.'
              : 'Ingest at least one source first, then generate your brand profile — or edit each section manually below.'}
          </p>
        ) : null}
        <div className="space-y-6">
          <EditIdentityCard initial={profile?.identity ?? {}} />
          {profile?.positioning ? <PositioningSection p={profile.positioning} /> : null}
          <EditVoiceCard initial={profile?.voice ?? {}} />
          {profile?.strategy ? <StrategySection s={profile.strategy} /> : null}
          {profile?.constraints ? <ConstraintsSection c={profile.constraints} /> : null}
          {hasProfile ? (
            <p className="pt-1 text-xs text-stone-400">
              Updated {new Date(profile!.updatedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      </CardBody>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function IdentitySection({ i }: { i: Identity }) {
  return (
    <Section title="Identity">
      {i.tagline ? (
        <p className="text-base font-medium italic text-stone-900">&ldquo;{i.tagline}&rdquo;</p>
      ) : null}
      {i.mission ? <Line label="Mission" value={i.mission} /> : null}
      {i.vision ? <Line label="Vision" value={i.vision} /> : null}
      <div className="grid grid-cols-2 gap-2 pt-1">
        {i.category ? <Chip label="Category" value={i.category} /> : null}
        {i.stage ? <Chip label="Stage" value={i.stage} /> : null}
        {i.hqLocation ? <Chip label="HQ" value={i.hqLocation} /> : null}
        {i.foundedYear ? <Chip label="Founded" value={String(i.foundedYear)} /> : null}
      </div>
      {i.markets?.length ? (
        <TagRow label="Markets" items={i.markets} />
      ) : null}
      {i.foundingStory ? (
        <div className="mt-1 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm leading-relaxed text-stone-700">
          {i.foundingStory}
        </div>
      ) : null}
    </Section>
  );
}

function PositioningSection({ p }: { p: Positioning }) {
  const nothing =
    !p.pointOfView && !p.uniqueInsight && !p.elevatorPitch && !p.differentiators?.length;
  if (nothing) return null;
  return (
    <Section title="Positioning">
      {p.elevatorPitch ? <Line label="Elevator pitch" value={p.elevatorPitch} /> : null}
      {p.pointOfView ? <Line label="Point of view" value={p.pointOfView} /> : null}
      {p.uniqueInsight ? <Line label="Insight" value={p.uniqueInsight} /> : null}
      {p.differentiators?.length ? (
        <ul className="space-y-1">
          {p.differentiators.map((d, idx) => (
            <li key={idx} className="flex gap-2 text-sm text-stone-800">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-stone-400" />
              {d}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function VoiceSection({ v }: { v: Voice }) {
  return (
    <Section title="Voice">
      {v.attributes?.length ? <TagRow label="Attributes" items={v.attributes} tone="info" /> : null}
      {v.avoid?.length ? <TagRow label="Avoid" items={v.avoid} tone="danger" /> : null}
      {v.signaturePhrases?.length ? (
        <div>
          <FieldLabel>Signature phrases</FieldLabel>
          <ul className="mt-1.5 space-y-1">
            {v.signaturePhrases.map((s, idx) => (
              <li key={idx} className="text-sm italic text-stone-700">
                &ldquo;{s}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {v.examples?.length ? (
        <div>
          <FieldLabel>Examples</FieldLabel>
          <div className="mt-1.5 space-y-2">
            {v.examples.map((ex, idx) => (
              <div key={idx} className="rounded-md border border-stone-200 bg-stone-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                  {ex.label}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-stone-800">{ex.text}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {v.lexicon?.length ? (
        <div>
          <FieldLabel>Lexicon</FieldLabel>
          <ul className="mt-1.5 space-y-1 text-sm text-stone-700">
            {v.lexicon.map((l, idx) => (
              <li key={idx}>
                <span className="font-medium text-stone-900">{l.preferred}</span>
                {l.instead_of ? (
                  <span className="text-stone-500"> — not &ldquo;{l.instead_of}&rdquo;</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {v.styleNotes ? <Line label="Style notes" value={v.styleNotes} /> : null}
    </Section>
  );
}

function StrategySection({ s }: { s: Strategy }) {
  const empty =
    !s.currentPriorities?.length &&
    !s.growthAudiences?.length &&
    !s.focusChannels?.length &&
    !s.upcomingLaunches?.length;
  if (empty) return null;
  return (
    <Section title="Strategy">
      {s.currentPriorities?.length ? (
        <TagRow label="Priorities" items={s.currentPriorities} />
      ) : null}
      {s.growthAudiences?.length ? (
        <TagRow label="Growth audiences" items={s.growthAudiences} />
      ) : null}
      {s.focusChannels?.length ? <TagRow label="Channels" items={s.focusChannels} /> : null}
      {s.upcomingLaunches?.length ? (
        <TagRow label="Launches" items={s.upcomingLaunches} />
      ) : null}
    </Section>
  );
}

function ConstraintsSection({ c }: { c: Constraints }) {
  const empty =
    !c.bannedPhrases?.length &&
    !c.requiredDisclosures?.length &&
    !c.compliance?.length &&
    !c.trademarkedTerms?.length &&
    !c.languages?.length;
  if (empty) return null;
  return (
    <Section title="Constraints">
      {c.bannedPhrases?.length ? (
        <TagRow label="Banned phrases" items={c.bannedPhrases} tone="danger" />
      ) : null}
      {c.requiredDisclosures?.length ? (
        <TagRow label="Required disclosures" items={c.requiredDisclosures} tone="warning" />
      ) : null}
      {c.compliance?.length ? <TagRow label="Compliance" items={c.compliance} /> : null}
      {c.trademarkedTerms?.length ? <TagRow label="Trademarks" items={c.trademarkedTerms} /> : null}
      {c.languages?.length ? <TagRow label="Languages" items={c.languages} /> : null}
    </Section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p className="mt-0.5 text-sm leading-relaxed text-stone-800">{value}</p>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{children}</p>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-stone-900">{value}</p>
    </div>
  );
}

function TagRow({
  label,
  items,
  tone = 'neutral',
}: {
  label: string;
  items: string[];
  tone?: 'neutral' | 'info' | 'warning' | 'danger';
}) {
  const toneCls = {
    neutral: 'bg-stone-100 text-stone-700 ring-stone-200',
    info: 'bg-blue-50 text-blue-700 ring-blue-200',
    warning: 'bg-amber-50 text-amber-700 ring-amber-200',
    danger: 'bg-red-50 text-red-700 ring-red-200',
  }[tone];
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((t, i) => (
          <span
            key={i}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneCls}`}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
