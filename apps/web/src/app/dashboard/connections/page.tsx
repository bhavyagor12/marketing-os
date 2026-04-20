import { eq, desc } from 'drizzle-orm';
import { KeyRound, Plug, Plus } from 'lucide-react';
import {
  db,
  aiProviderCredentials,
  socialConnections,
} from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { requireOrgSession } from '@/lib/require-session';

export default async function ConnectionsPage() {
  const { activeOrgId } = await requireOrgSession();

  const keys = await db
    .select()
    .from(aiProviderCredentials)
    .where(eq(aiProviderCredentials.organizationId, activeOrgId))
    .orderBy(desc(aiProviderCredentials.createdAt));

  const socials = await db
    .select()
    .from(socialConnections)
    .where(eq(socialConnections.organizationId, activeOrgId))
    .orderBy(desc(socialConnections.createdAt));

  return (
    <>
      <PageHeader
        title="Connections"
        subtitle="Bring your AI provider keys and connect social accounts."
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="AI providers"
              subtitle="BYO keys are encrypted at rest with AES-256-GCM."
              action={
                <Button size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} disabled>
                  Add key
                </Button>
              }
            />
            <CardBody>
              {keys.length === 0 ? (
                <EmptyState
                  icon={<KeyRound className="h-4 w-4" />}
                  title="No keys connected"
                  description="Add an Anthropic API key to power the planner and content agents."
                />
              ) : (
                <ul className="divide-y divide-stone-200">
                  {keys.map((k) => (
                    <li key={k.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-stone-100 text-stone-600">
                        <KeyRound className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900">
                          {k.label ?? `${k.provider} key`}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          ···· {k.keyFingerprint} · {k.provider}
                        </p>
                      </div>
                      <Badge tone="success" dot>Active</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Social accounts"
              subtitle="OAuth-connected accounts that can publish."
              action={
                <Button size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} disabled>
                  Connect
                </Button>
              }
            />
            <CardBody>
              {socials.length === 0 ? (
                <EmptyState
                  icon={<Plug className="h-4 w-4" />}
                  title="No social accounts"
                  description="X, LinkedIn, Instagram, and Email connectors land next — Meta and LinkedIn require app review."
                />
              ) : (
                <ul className="divide-y divide-stone-200">
                  {socials.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900">{s.accountHandle}</p>
                        <p className="mt-0.5 text-xs text-stone-500">{s.platform}</p>
                      </div>
                      <Badge tone={s.status === 'active' ? 'success' : 'warning'} dot>
                        {s.status}
                      </Badge>
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
