import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { Command } from 'lucide-react';
import { db, invitation, organization } from '@marketing-os/db';
import { auth } from '@/lib/auth';
import { AcceptClient } from './AcceptClient';

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [inv] = await db
    .select()
    .from(invitation)
    .where(eq(invitation.id, id))
    .limit(1);
  if (!inv) notFound();

  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, inv.organizationId))
    .limit(1);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect(
      `/signin?next=${encodeURIComponent(`/accept-invitation/${id}`)}&invite_email=${encodeURIComponent(inv.email)}`,
    );
  }

  const expired = new Date(inv.expiresAt).getTime() < Date.now();
  const emailMismatch = session.user.email.toLowerCase() !== inv.email.toLowerCase();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-stone-800 to-stone-950 text-white shadow-sm">
            <Command className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-stone-900">Marketing OS</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Join a workspace</h1>

        <div className="mt-6">
          {inv.status !== 'pending' ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This invitation is <strong>{inv.status}</strong>.
            </div>
          ) : expired ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This invitation has expired. Ask the sender for a new one.
            </div>
          ) : emailMismatch ? (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                This invitation was sent to{' '}
                <strong className="font-mono">{inv.email}</strong> but you&apos;re signed in as{' '}
                <strong className="font-mono">{session.user.email}</strong>.
              </div>
              <p className="text-sm text-stone-600">
                <Link
                  href="/signin"
                  className="font-medium text-stone-900 underline underline-offset-2"
                >
                  Sign in with the invited email
                </Link>{' '}
                to accept.
              </p>
            </div>
          ) : (
            <AcceptClient
              invitationId={inv.id}
              organizationName={org?.name ?? 'a workspace'}
              role={inv.role}
            />
          )}
        </div>
      </div>
    </main>
  );
}
