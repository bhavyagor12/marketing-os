import { eq } from 'drizzle-orm';
import { Users, UserPlus } from 'lucide-react';
import { db, member, user } from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { requireOrgSession } from '@/lib/require-session';

export default async function TeamPage() {
  const { activeOrgId } = await requireOrgSession();

  const members = await db
    .select({
      memberId: member.id,
      role: member.role,
      userId: user.id,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, activeOrgId));

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Invite teammates to draft, review, and approve content together."
        actions={
          <Button leadingIcon={<UserPlus className="h-4 w-4" />} disabled>
            Invite
          </Button>
        }
      />
      <PageBody>
        <Card>
          <CardHeader title="Members" subtitle={`${members.length} total`} />
          <CardBody>
            {members.length === 0 ? (
              <EmptyState
                icon={<Users className="h-4 w-4" />}
                title="Just you for now"
                description="Invite teammates to collaborate — invites coming next."
              />
            ) : (
              <ul className="divide-y divide-stone-200">
                {members.map((m) => {
                  const initials = m.name
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <li key={m.memberId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-stone-900 text-[11px] font-semibold text-white">
                        {initials || 'U'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900">{m.name}</p>
                        <p className="mt-0.5 text-xs text-stone-500">{m.email}</p>
                      </div>
                      <Badge tone={m.role === 'owner' || m.role === 'admin' ? 'info' : 'neutral'}>
                        {m.role}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
