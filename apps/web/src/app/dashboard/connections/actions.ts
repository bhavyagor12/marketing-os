'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, emit, aiProviderCredentials, socialConnections } from '@marketing-os/db';
import { EventType, EventSubjectType, aiProviderSchema } from '@marketing-os/shared';
import { requireOrgSession } from '@/lib/require-session';
import { encryptSecret, keyFingerprint } from '@/lib/crypto';

export async function addAiProviderKey(formData: FormData) {
  const { session, activeOrgId } = await requireOrgSession();

  const providerRaw = String(formData.get('provider') ?? 'anthropic');
  const parsedProvider = aiProviderSchema.safeParse(providerRaw);
  if (!parsedProvider.success) return { error: 'Invalid provider' };

  const rawKey = String(formData.get('key') ?? '').trim();
  if (!rawKey) return { error: 'API key is required' };
  if (rawKey.length < 20) return { error: 'Key looks too short to be real' };
  if (parsedProvider.data === 'anthropic' && !rawKey.startsWith('sk-ant-')) {
    return { error: 'Anthropic keys start with sk-ant-' };
  }
  if (parsedProvider.data === 'openai' && !rawKey.startsWith('sk-')) {
    return { error: 'OpenAI keys start with sk-' };
  }
  if (parsedProvider.data === 'voyage' && !rawKey.startsWith('pa-')) {
    return { error: 'Voyage keys start with pa-' };
  }

  const label = (formData.get('label') as string | null) || null;

  const encryptedKey = encryptSecret(rawKey);
  const fingerprint = keyFingerprint(rawKey);

  const [row] = await db
    .insert(aiProviderCredentials)
    .values({
      organizationId: activeOrgId,
      provider: parsedProvider.data,
      label,
      encryptedKey,
      keyFingerprint: fingerprint,
      createdByUserId: session.user.id,
    })
    .returning();

  await emit({
    organizationId: activeOrgId,
    type: EventType.AiKeyConnected,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.AiCredential, id: row!.id },
    properties: { provider: parsedProvider.data, label, fingerprint },
    message: `Connected ${parsedProvider.data} key ····${fingerprint}`,
  });

  revalidatePath('/dashboard/connections');
  return { ok: true };
}

export async function deleteAiProviderKey(id: string) {
  const { session, activeOrgId } = await requireOrgSession();
  const [row] = await db
    .select()
    .from(aiProviderCredentials)
    .where(
      and(
        eq(aiProviderCredentials.id, id),
        eq(aiProviderCredentials.organizationId, activeOrgId),
      ),
    )
    .limit(1);
  if (!row) return { error: 'Key not found' };

  await db.delete(aiProviderCredentials).where(eq(aiProviderCredentials.id, id));

  await emit({
    organizationId: activeOrgId,
    type: EventType.AiKeyRevoked,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.AiCredential, id: row.id },
    properties: { provider: row.provider, fingerprint: row.keyFingerprint },
    message: `Removed ${row.provider} key ····${row.keyFingerprint}`,
  });

  revalidatePath('/dashboard/connections');
  return { ok: true };
}

export async function addEmailConnection(formData: FormData) {
  const { session, activeOrgId } = await requireOrgSession();
  const apiKey = String(formData.get('apiKey') ?? '').trim();
  const fromAddress = String(formData.get('fromAddress') ?? '').trim();
  const fromName = (formData.get('fromName') as string | null)?.trim() || '';

  if (!apiKey.startsWith('re_')) return { error: 'Resend keys start with re_' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromAddress)) {
    return { error: 'Enter a valid from-address (must be on a Resend-verified domain)' };
  }

  const [row] = await db
    .insert(socialConnections)
    .values({
      organizationId: activeOrgId,
      platform: 'email',
      accountHandle: fromAddress,
      // externalAccountId repurposed as the from-name for email
      externalAccountId: fromName,
      encryptedAccessToken: encryptSecret(apiKey),
      scopes: [],
      connectedByUserId: session.user.id,
      status: 'active',
    })
    .returning();

  await emit({
    organizationId: activeOrgId,
    type: EventType.SocialConnected,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.SocialConnection, id: row!.id },
    platform: 'email',
    properties: { fromAddress, fromName },
    message: `Connected email sender ${fromAddress}`,
  });

  revalidatePath('/dashboard/connections');
  return { ok: true };
}

export async function disconnectSocial(id: string) {
  const { session, activeOrgId } = await requireOrgSession();
  const [row] = await db
    .select()
    .from(socialConnections)
    .where(
      and(
        eq(socialConnections.id, id),
        eq(socialConnections.organizationId, activeOrgId),
      ),
    )
    .limit(1);
  if (!row) return { error: 'Connection not found' };

  await db.delete(socialConnections).where(eq(socialConnections.id, id));

  await emit({
    organizationId: activeOrgId,
    type: EventType.SocialDisconnected,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.SocialConnection, id: row.id },
    platform: row.platform,
    properties: { handle: row.accountHandle },
    message: `Disconnected ${row.platform} @${row.accountHandle}`,
  });

  revalidatePath('/dashboard/connections');
  return { ok: true };
}
