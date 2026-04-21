'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { db, emit, leads } from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import type { LeadStatus } from '@marketing-os/db';
import { requireOrgSession } from '@/lib/require-session';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function addLead(formData: FormData) {
  const { session, activeOrgId } = await requireOrgSession();

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: 'Valid email required' };

  const firstName = (formData.get('firstName') as string | null)?.trim() || null;
  const lastName = (formData.get('lastName') as string | null)?.trim() || null;
  const company = (formData.get('company') as string | null)?.trim() || null;
  const title = (formData.get('title') as string | null)?.trim() || null;
  const linkedinUrl = (formData.get('linkedinUrl') as string | null)?.trim() || null;
  const tagsRaw = (formData.get('tags') as string | null) ?? '';
  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  try {
    const [row] = await db
      .insert(leads)
      .values({
        organizationId: activeOrgId,
        email,
        firstName,
        lastName,
        fullName: [firstName, lastName].filter(Boolean).join(' ') || null,
        company,
        title,
        linkedinUrl,
        tags,
        source: 'manual',
        createdByUserId: session.user.id,
      })
      .returning();

    await emit({
      organizationId: activeOrgId,
      type: EventType.LeadCreated,
      actor: { userId: session.user.id },
      subject: { type: EventSubjectType.Lead, id: row!.id },
      properties: { email, company, title, source: 'manual' },
      message: `Added lead ${email}`,
    });

    revalidatePath('/dashboard/leads');
    return { ok: true, id: row!.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/duplicate|unique/i.test(message)) {
      return { error: 'A lead with this email already exists' };
    }
    return { error: message };
  }
}

export async function importLeadsCsv(formData: FormData) {
  const { session, activeOrgId } = await requireOrgSession();
  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'No file provided' };
  if (file.size === 0) return { error: 'Empty file' };
  if (file.size > 5 * 1024 * 1024) return { error: 'CSV must be under 5MB' };

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) return { error: 'CSV needs a header row + at least one data row' };

  const header = rows[0]!.map((h) => h.toLowerCase().trim());
  const colIdx = (names: string[]) => {
    for (const n of names) {
      const idx = header.indexOf(n);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const emailCol = colIdx(['email', 'e-mail', 'mail']);
  if (emailCol === -1) {
    return { error: 'CSV must have an "email" column' };
  }
  const firstCol = colIdx(['first_name', 'firstname', 'first name', 'given_name']);
  const lastCol = colIdx(['last_name', 'lastname', 'last name', 'surname', 'family_name']);
  const fullCol = colIdx(['name', 'full_name', 'fullname']);
  const companyCol = colIdx(['company', 'organization', 'org', 'account']);
  const titleCol = colIdx(['title', 'role', 'position', 'job_title']);
  const linkedinCol = colIdx(['linkedin', 'linkedin_url', 'li_url']);
  const tagsCol = colIdx(['tags', 'tag', 'segments']);

  const valid: Array<typeof leads.$inferInsert> = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const email = (row[emailCol] ?? '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      skipped += 1;
      continue;
    }
    const firstName = firstCol >= 0 ? (row[firstCol] ?? '').trim() || null : null;
    const lastName = lastCol >= 0 ? (row[lastCol] ?? '').trim() || null : null;
    const fullName =
      fullCol >= 0
        ? (row[fullCol] ?? '').trim() || null
        : [firstName, lastName].filter(Boolean).join(' ') || null;
    const tags =
      tagsCol >= 0
        ? (row[tagsCol] ?? '')
            .split(/[,;|]/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

    valid.push({
      organizationId: activeOrgId,
      email,
      firstName,
      lastName,
      fullName,
      company: companyCol >= 0 ? (row[companyCol] ?? '').trim() || null : null,
      title: titleCol >= 0 ? (row[titleCol] ?? '').trim() || null : null,
      linkedinUrl: linkedinCol >= 0 ? (row[linkedinCol] ?? '').trim() || null : null,
      tags,
      source: 'import',
      createdByUserId: session.user.id,
    });
  }

  if (valid.length === 0) {
    return { error: `No valid rows. Skipped ${skipped}.` };
  }

  // ON CONFLICT: update name/company/title/tags, don't overwrite engagement rollups.
  let inserted = 0;
  for (const batch of chunks(valid, 200)) {
    const out = await db
      .insert(leads)
      .values(batch)
      .onConflictDoUpdate({
        target: [leads.organizationId, leads.email],
        set: {
          firstName: sql`EXCLUDED.first_name`,
          lastName: sql`EXCLUDED.last_name`,
          fullName: sql`EXCLUDED.full_name`,
          company: sql`EXCLUDED.company`,
          title: sql`EXCLUDED.title`,
          linkedinUrl: sql`EXCLUDED.linkedin_url`,
          tags: sql`EXCLUDED.tags`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: leads.id });
    inserted += out.length;
  }

  await emit({
    organizationId: activeOrgId,
    type: EventType.LeadImported,
    actor: { userId: session.user.id },
    properties: { count: inserted, skipped, filename: file.name },
    message: `Imported ${inserted} lead${inserted === 1 ? '' : 's'} from ${file.name}`,
  });

  revalidatePath('/dashboard/leads');
  return { ok: true, inserted, skipped };
}

export async function updateLeadStatus(leadId: string, status: LeadStatus) {
  const { session, activeOrgId } = await requireOrgSession();
  const [row] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, activeOrgId)))
    .limit(1);
  if (!row) return { error: 'lead not found' };
  if (row.status === status) return { ok: true };

  await db
    .update(leads)
    .set({
      status,
      updatedAt: new Date(),
      unsubscribedAt: status === 'unsubscribed' ? new Date() : row.unsubscribedAt,
    })
    .where(eq(leads.id, leadId));

  await emit({
    organizationId: activeOrgId,
    type: EventType.LeadStatusChanged,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Lead, id: leadId },
    properties: { from: row.status, to: status },
    message: `${row.email}: ${row.status} → ${status}`,
  });

  revalidatePath('/dashboard/leads');
  revalidatePath(`/dashboard/leads/${leadId}`);
  return { ok: true };
}

export async function deleteLead(leadId: string) {
  const { session, activeOrgId } = await requireOrgSession();
  const [row] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, activeOrgId)))
    .limit(1);
  if (!row) return { error: 'lead not found' };

  await db.delete(leads).where(eq(leads.id, leadId));

  await emit({
    organizationId: activeOrgId,
    type: EventType.LeadDeleted,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Lead, id: leadId },
    properties: { email: row.email },
    message: `Deleted ${row.email}`,
  });

  revalidatePath('/dashboard/leads');
  return { ok: true };
}

// ---------- helpers ----------

function parseCsv(input: string): string[][] {
  // RFC 4180–ish: handles quoted fields with commas + escaped quotes (""). Adequate for MVP.
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && input[i + 1] === '\n') i += 1;
        row.push(field);
        out.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    out.push(row);
  }
  return out.filter((r) => r.some((c) => c.trim().length > 0));
}

function* chunks<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}
