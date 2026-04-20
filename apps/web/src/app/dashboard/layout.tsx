import type { ReactNode } from 'react';
import { eq } from 'drizzle-orm';
import { db, organization } from '@marketing-os/db';
import { AppShell } from '@/components/shell/AppShell';
import { requireOrgSession } from '@/lib/require-session';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { session, activeOrgId } = await requireOrgSession();

  const [org] = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.id, activeOrgId))
    .limit(1);

  const orgName = org?.name ?? 'Workspace';

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email }} orgName={orgName}>
      {children}
    </AppShell>
  );
}
