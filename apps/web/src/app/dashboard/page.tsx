import Link from 'next/link';
import { and, eq, count, desc, gte } from 'drizzle-orm';
import {
  db,
  brandProfiles,
  brandIngestionSources,
  aiProviderCredentials,
  socialConnections,
  campaigns,
  events,
  member,
  user,
} from '@marketing-os/db';
import {
  Sparkles,
  KeyRound,
  Share2,
  Megaphone,
  ArrowUpRight,
  BookOpen,
  Rocket,
} from 'lucide-react';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { requireOrgSession } from '@/lib/require-session';
import { ActivityFeed } from '@/components/events/ActivityFeed';

export default async function OverviewPage() {
  const { session, activeOrgId } = await requireOrgSession();

  const [brandProfile] = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.organizationId, activeOrgId))
    .limit(1);

  const [brandSourcesCount] = await db
    .select({ count: count() })
    .from(brandIngestionSources)
    .where(
      and(
        eq(brandIngestionSources.organizationId, activeOrgId),
        eq(brandIngestionSources.status, 'completed'),
      ),
    );

  const [aiKeyRow] = await db
    .select({ id: aiProviderCredentials.id })
    .from(aiProviderCredentials)
    .where(eq(aiProviderCredentials.organizationId, activeOrgId))
    .limit(1);

  const [socialCountRow] = await db
    .select({ count: count() })
    .from(socialConnections)
    .where(eq(socialConnections.organizationId, activeOrgId));

  const [campaignCountRow] = await db
    .select({ count: count() })
    .from(campaigns)
    .where(eq(campaigns.organizationId, activeOrgId));

  const brandReady = Boolean(brandProfile?.mission);
  const aiKeyReady = Boolean(aiKeyRow);
  const socialCount = socialCountRow?.count ?? 0;
  const campaignCount = campaignCountRow?.count ?? 0;

  const firstName = session.user.name?.split(' ')[0] ?? 'there';

  // Activity feed data
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const recentEvents = await db
    .select()
    .from(events)
    .where(eq(events.organizationId, activeOrgId))
    .orderBy(desc(events.occurredAt))
    .limit(20);

  const myWeekEvents = await db
    .select({ type: events.type })
    .from(events)
    .where(
      and(
        eq(events.organizationId, activeOrgId),
        eq(events.actorUserId, session.user.id),
        gte(events.occurredAt, weekAgo),
      ),
    );

  const members = await db
    .select({ userId: member.userId, name: user.name })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, activeOrgId));

  const users = members.map((m) => ({ id: m.userId, name: m.name }));
  const myWeekCount = myWeekEvents.length;

  const steps = [
    {
      label: 'Connect your Anthropic key',
      done: aiKeyReady,
      href: '/dashboard/connections',
    },
    {
      label: 'Teach us your brand',
      done: brandReady,
      href: '/dashboard/brand',
    },
    {
      label: 'Connect a social account',
      done: socialCount > 0,
      href: '/dashboard/connections',
    },
    {
      label: 'Launch your first campaign',
      done: campaignCount > 0,
      href: '/dashboard/campaigns',
    },
  ];
  const completed = steps.filter((s) => s.done).length;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Your AI marketing workspace at a glance."
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<Sparkles className="h-4 w-4" />}
            label="Brand setup"
            value={brandReady ? 'Ready' : 'Incomplete'}
            tone={brandReady ? 'success' : 'warning'}
            detail={
              brandSourcesCount?.count
                ? `${brandSourcesCount.count} source${brandSourcesCount.count === 1 ? '' : 's'} ingested`
                : 'No sources yet'
            }
          />
          <StatCard
            icon={<KeyRound className="h-4 w-4" />}
            label="Anthropic key"
            value={aiKeyReady ? 'Connected' : 'Not connected'}
            tone={aiKeyReady ? 'success' : 'warning'}
            detail={aiKeyReady ? 'BYO key active' : 'Required to run agents'}
          />
          <StatCard
            icon={<Share2 className="h-4 w-4" />}
            label="Social accounts"
            value={String(socialCount)}
            tone={socialCount > 0 ? 'success' : 'neutral'}
            detail={socialCount > 0 ? 'Ready to publish' : 'Connect X / LinkedIn'}
          />
          <StatCard
            icon={<Megaphone className="h-4 w-4" />}
            label="Campaigns"
            value={String(campaignCount)}
            tone={campaignCount > 0 ? 'info' : 'neutral'}
            detail={campaignCount > 0 ? 'Active workspace' : 'Start your first'}
          />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Get started"
              subtitle={`${completed} of ${steps.length} steps complete`}
              action={
                <Badge tone={completed === steps.length ? 'success' : 'info'}>
                  {Math.round((completed / steps.length) * 100)}%
                </Badge>
              }
            />
            <ul className="divide-y divide-stone-200">
              {steps.map((step, i) => (
                <li key={step.label}>
                  <Link
                    href={step.href}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-stone-50"
                  >
                    <span
                      className={
                        step.done
                          ? 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white'
                          : 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-xs font-semibold text-stone-500'
                      }
                    >
                      {step.done ? '✓' : i + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium text-stone-900">
                      {step.label}
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-stone-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Quick actions" />
            <CardBody className="space-y-2">
              <QuickAction
                href="/dashboard/brand"
                icon={<BookOpen className="h-4 w-4" />}
                title="Add brand context"
                description="Paste a URL or upload a PDF"
              />
              <QuickAction
                href="/dashboard/campaigns"
                icon={<Rocket className="h-4 w-4" />}
                title="New campaign"
                description="Brief → plan → drafts"
              />
              <QuickAction
                href="/dashboard/connections"
                icon={<KeyRound className="h-4 w-4" />}
                title="Add API key"
                description="BYO Anthropic or OpenAI"
              />
            </CardBody>
          </Card>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Recent activity"
              subtitle="Everything that happened in your workspace."
              action={
                <Link
                  href="/dashboard/activity"
                  className="text-xs font-medium text-stone-600 underline hover:text-stone-900"
                >
                  View all →
                </Link>
              }
            />
            <CardBody>
              <ActivityFeed events={recentEvents as never} users={users} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="You this week" />
            <CardBody>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight text-stone-900">
                  {myWeekCount}
                </span>
                <span className="text-sm text-stone-500">
                  action{myWeekCount === 1 ? '' : 's'}
                </span>
              </div>
              <p className="mt-1 text-xs text-stone-500">
                In the last 7 days. Impact metrics arrive once publishing + tracking are wired.
              </p>
              <Link
                href="/dashboard/activity?scope=me&range=7d"
                className="mt-4 inline-block text-xs font-medium text-stone-900 underline hover:text-stone-700"
              >
                See what you did →
              </Link>
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'neutral' | 'info';
  detail: string;
}) {
  return (
    <Card>
      <div className="px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-stone-100 text-stone-600">
            {icon}
          </span>
          <Badge tone={tone} dot>
            {label}
          </Badge>
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">{value}</p>
        <p className="mt-0.5 text-xs text-stone-500">{detail}</p>
      </div>
    </Card>
  );
}

function QuickAction({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-md border border-stone-200 bg-white px-3 py-2.5 transition hover:border-stone-300 hover:bg-stone-50"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-900 text-white">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-stone-900">{title}</span>
        <span className="block text-xs text-stone-500">{description}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-stone-400" />
    </Link>
  );
}
