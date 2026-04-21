import { and, eq, gt } from 'drizzle-orm';
import { Users, Mail } from 'lucide-react';
import { db, member, user, invitation } from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { requireOrgSession } from '@/lib/require-session';
import { InviteForm } from './InviteForm';
import { CancelInvitationButton } from './CancelInvitationButton';
import { CopyInviteLink } from './CopyInviteLink';

export default async function TeamPage() {
  const { activeOrgId } = await requireOrgSession();

  const members = await db
    .select({
      memberId: member.id,
      role: member.role,
      userId: user.id,
      name: user.name,
      email: user.email,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, activeOrgId));

  const pendingInvites = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, activeOrgId),
        eq(invitation.status, 'pending'),
        gt(invitation.expiresAt, new Date()),
      ),
    );

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Invite teammates to draft, review, and approve content together."
        actions={<InviteForm />}
      />
      <PageBody>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Members" subtitle={`${members.length} total`} />
            <CardBody>
              {members.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-4 w-4" />}
                  title="Just you for now"
                  description="Invite teammates above."
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
                      <li
                        key={m.memberId}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-stone-900 text-[11px] font-semibold text-white">
                          {initials || 'U'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-stone-900">{m.name}</p>
                          <p className="mt-0.5 text-xs text-stone-500">
                            {m.email} · joined {new Date(m.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge tone={roleTone(m.role)}>{m.role}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Pending invitations"
              subtitle={`${pendingInvites.length} outstanding`}
            />
            <CardBody>
              {pendingInvites.length === 0 ? (
                <EmptyState
                  icon={<Mail className="h-4 w-4" />}
                  title="No pending invitations"
                  description="Use the Invite button above. Copy the invite link and share it manually — transactional email isn't wired yet."
                />
              ) : (
                <ul className="divide-y divide-stone-200">
                  {pendingInvites.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-stone-100 text-stone-600">
                        <Mail className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900">{inv.email}</p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          expires {new Date(inv.expiresAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge tone={roleTone(inv.role)}>{inv.role}</Badge>
                      <CopyInviteLink invitationId={inv.id} />
                      <CancelInvitationButton invitationId={inv.id} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function roleTone(role: string): 'info' | 'warning' | 'neutral' {
  if (role === 'owner') return 'warning';
  if (role === 'admin') return 'info';
  return 'neutral';
}
