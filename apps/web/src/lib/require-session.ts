import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';

export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/signin');
  return session;
}

export async function requireOrgSession() {
  const session = await requireSession();
  const activeOrgId = session.session.activeOrganizationId;
  if (!activeOrgId) redirect('/signup');
  return { session, activeOrgId };
}
