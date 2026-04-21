'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import {
  db,
  emit,
  brandProfiles,
  brandPersonas,
  brandValuePropositions,
  brandCompetitors,
} from '@marketing-os/db';
import type {
  BrandIdentity,
  BrandPositioning,
  BrandVoice,
  BrandStrategy,
  BrandConstraints,
} from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import { requireOrgSession } from '@/lib/require-session';

async function ensureProfile(activeOrgId: string) {
  const [existing] = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.organizationId, activeOrgId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(brandProfiles)
    .values({ organizationId: activeOrgId })
    .returning();
  return created!;
}

function emitUpdate(
  activeOrgId: string,
  userId: string,
  section: string,
  summary: string,
) {
  return emit({
    organizationId: activeOrgId,
    type: EventType.BrandProfileGenerated, // reuse — "updated" flavor via properties
    actor: { userId },
    subject: { type: EventSubjectType.BrandProfile, id: activeOrgId },
    properties: { section, action: 'edited' },
    message: `Updated brand ${section}: ${summary.slice(0, 80)}`,
  });
}

export async function saveBrandIdentity(identity: BrandIdentity) {
  const { session, activeOrgId } = await requireOrgSession();
  await ensureProfile(activeOrgId);

  // Keep the legacy `mission` shorthand in sync so the rest of the app (overview stat card)
  // doesn't need to read the JSONB.
  await db
    .update(brandProfiles)
    .set({
      identity,
      mission: identity.mission ?? null,
      updatedByUserId: session.user.id,
      updatedAt: new Date(),
    })
    .where(eq(brandProfiles.organizationId, activeOrgId));

  await emitUpdate(activeOrgId, session.user.id, 'identity', identity.mission ?? identity.tagline ?? 'identity fields');

  revalidatePath('/dashboard/brand');
  return { ok: true };
}

export async function saveBrandPositioning(positioning: BrandPositioning) {
  const { session, activeOrgId } = await requireOrgSession();
  await ensureProfile(activeOrgId);
  await db
    .update(brandProfiles)
    .set({
      positioning,
      updatedByUserId: session.user.id,
      updatedAt: new Date(),
    })
    .where(eq(brandProfiles.organizationId, activeOrgId));
  await emitUpdate(
    activeOrgId,
    session.user.id,
    'positioning',
    positioning.elevatorPitch ?? positioning.pointOfView ?? 'positioning',
  );
  revalidatePath('/dashboard/brand');
  return { ok: true };
}

export async function saveBrandVoice(voice: BrandVoice) {
  const { session, activeOrgId } = await requireOrgSession();
  await ensureProfile(activeOrgId);
  await db
    .update(brandProfiles)
    .set({
      voice,
      voiceTone: voice, // legacy mirror
      updatedByUserId: session.user.id,
      updatedAt: new Date(),
    })
    .where(eq(brandProfiles.organizationId, activeOrgId));
  await emitUpdate(
    activeOrgId,
    session.user.id,
    'voice',
    (voice.attributes ?? []).join(', ') || 'voice',
  );
  revalidatePath('/dashboard/brand');
  return { ok: true };
}

export async function saveBrandStrategy(strategy: BrandStrategy) {
  const { session, activeOrgId } = await requireOrgSession();
  await ensureProfile(activeOrgId);
  await db
    .update(brandProfiles)
    .set({
      strategy,
      updatedByUserId: session.user.id,
      updatedAt: new Date(),
    })
    .where(eq(brandProfiles.organizationId, activeOrgId));
  await emitUpdate(
    activeOrgId,
    session.user.id,
    'strategy',
    (strategy.currentPriorities ?? []).join(', ') || 'strategy',
  );
  revalidatePath('/dashboard/brand');
  return { ok: true };
}

export async function saveBrandConstraints(constraints: BrandConstraints) {
  const { session, activeOrgId } = await requireOrgSession();
  await ensureProfile(activeOrgId);
  await db
    .update(brandProfiles)
    .set({
      constraints,
      updatedByUserId: session.user.id,
      updatedAt: new Date(),
    })
    .where(eq(brandProfiles.organizationId, activeOrgId));
  await emitUpdate(
    activeOrgId,
    session.user.id,
    'constraints',
    (constraints.bannedPhrases ?? []).join(', ') || 'constraints',
  );
  revalidatePath('/dashboard/brand');
  return { ok: true };
}

// ---------- Persona CRUD ----------

export async function addPersona(data: {
  name: string;
  description?: string;
  painPoints?: string[];
  jobsToBeDone?: string[];
  channels?: string[];
}) {
  const { session, activeOrgId } = await requireOrgSession();
  const name = data.name.trim();
  if (!name) return { error: 'Name required' };
  const [row] = await db
    .insert(brandPersonas)
    .values({
      organizationId: activeOrgId,
      name,
      description: data.description ?? null,
      painPoints: data.painPoints ?? [],
      jobsToBeDone: data.jobsToBeDone ?? [],
      channels: data.channels ?? [],
      rank: 999,
    })
    .returning();
  await emit({
    organizationId: activeOrgId,
    type: EventType.BrandProfileGenerated,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.BrandProfile, id: activeOrgId },
    properties: { section: 'persona', action: 'added', name },
    message: `Added persona "${name}"`,
  });
  revalidatePath('/dashboard/brand');
  return { ok: true, id: row!.id };
}

export async function deletePersona(personaId: string) {
  const { session, activeOrgId } = await requireOrgSession();
  const [row] = await db
    .select()
    .from(brandPersonas)
    .where(
      and(
        eq(brandPersonas.id, personaId),
        eq(brandPersonas.organizationId, activeOrgId),
      ),
    )
    .limit(1);
  if (!row) return { error: 'not found' };
  await db.delete(brandPersonas).where(eq(brandPersonas.id, personaId));
  await emit({
    organizationId: activeOrgId,
    type: EventType.BrandProfileGenerated,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.BrandProfile, id: activeOrgId },
    properties: { section: 'persona', action: 'deleted', name: row.name },
    message: `Removed persona "${row.name}"`,
  });
  revalidatePath('/dashboard/brand');
  return { ok: true };
}

// ---------- Value prop CRUD ----------

export async function addValueProp(data: {
  title: string;
  description?: string;
  proof?: string[];
}) {
  const { session, activeOrgId } = await requireOrgSession();
  const title = data.title.trim();
  if (!title) return { error: 'Title required' };
  const [row] = await db
    .insert(brandValuePropositions)
    .values({
      organizationId: activeOrgId,
      title,
      description: data.description ?? null,
      proof: data.proof ?? [],
      rank: 999,
    })
    .returning();
  await emit({
    organizationId: activeOrgId,
    type: EventType.BrandProfileGenerated,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.BrandProfile, id: activeOrgId },
    properties: { section: 'value_prop', action: 'added', title },
    message: `Added value prop "${title}"`,
  });
  revalidatePath('/dashboard/brand');
  return { ok: true, id: row!.id };
}

export async function deleteValueProp(id: string) {
  const { activeOrgId } = await requireOrgSession();
  await db
    .delete(brandValuePropositions)
    .where(
      and(
        eq(brandValuePropositions.id, id),
        eq(brandValuePropositions.organizationId, activeOrgId),
      ),
    );
  revalidatePath('/dashboard/brand');
  return { ok: true };
}

// ---------- Competitor CRUD ----------

export async function addCompetitor(data: {
  name: string;
  website?: string;
  competitorType?: 'direct' | 'indirect' | 'alternative';
  howWeDiffer?: string;
}) {
  const { session, activeOrgId } = await requireOrgSession();
  const name = data.name.trim();
  if (!name) return { error: 'Name required' };
  const [row] = await db
    .insert(brandCompetitors)
    .values({
      organizationId: activeOrgId,
      name,
      website: data.website || null,
      competitorType: data.competitorType ?? null,
      howWeDiffer: data.howWeDiffer || null,
    })
    .returning();
  await emit({
    organizationId: activeOrgId,
    type: EventType.BrandProfileGenerated,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.BrandProfile, id: activeOrgId },
    properties: { section: 'competitor', action: 'added', name },
    message: `Added competitor "${name}"`,
  });
  revalidatePath('/dashboard/brand');
  return { ok: true, id: row!.id };
}

export async function deleteCompetitor(id: string) {
  const { activeOrgId } = await requireOrgSession();
  await db
    .delete(brandCompetitors)
    .where(
      and(
        eq(brandCompetitors.id, id),
        eq(brandCompetitors.organizationId, activeOrgId),
      ),
    );
  revalidatePath('/dashboard/brand');
  return { ok: true };
}
