import Link from 'next/link';
import { eq, desc } from 'drizzle-orm';
import { KeyRound, Plug, AlertTriangle } from 'lucide-react';
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
import { AddApiKeyForm } from './AddApiKeyForm';
import { DeleteKeyButton } from './DeleteKeyButton';
import { DisconnectSocialButton } from './DisconnectSocialButton';
import { AddEmailForm } from './AddEmailForm';

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    x_error?: string;
    linkedin_error?: string;
    meta_error?: string;
  }>;
}) {
  const sp = await searchParams;
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
        subtitle="Bring your own AI provider keys and connect social accounts."
      />
      <PageBody>
        {sp.connected ? (
          <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Connected {sp.connected.toUpperCase()} successfully.
          </div>
        ) : null}
        {sp.x_error ? (
          <div className="mb-5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">X connection failed</p>
              <p className="mt-0.5 text-xs">{sp.x_error}</p>
            </div>
          </div>
        ) : null}
        {sp.linkedin_error ? (
          <div className="mb-5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">LinkedIn connection failed</p>
              <p className="mt-0.5 text-xs">{sp.linkedin_error}</p>
            </div>
          </div>
        ) : null}
        {sp.meta_error ? (
          <div className="mb-5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Instagram connection failed</p>
              <p className="mt-0.5 text-xs">{sp.meta_error}</p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="AI providers"
              subtitle="Keys are encrypted at rest with AES-256-GCM."
            />
            <CardBody className="space-y-4">
              <AddApiKeyForm />

              {keys.length === 0 ? (
                <EmptyState
                  icon={<KeyRound className="h-4 w-4" />}
                  title="No keys connected"
                  description="Add an Anthropic API key above. Agents will pick it up automatically."
                />
              ) : (
                <ul className="divide-y divide-stone-200">
                  {keys.map((k) => (
                    <li
                      key={k.id}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-stone-100 text-stone-600">
                        <KeyRound className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900">
                          {k.label ?? `${k.provider} key`}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-stone-500">
                          ····{k.keyFingerprint} · {k.provider}
                          {k.lastUsedAt
                            ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                            : ' · unused'}
                        </p>
                      </div>
                      <Badge tone="success" dot>
                        Active
                      </Badge>
                      <DeleteKeyButton id={k.id} />
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
                <div className="flex items-center gap-2">
                  <Link href="/api/connections/x/start">
                    <Button size="sm">Connect X</Button>
                  </Link>
                  <Link href="/api/connections/linkedin/start">
                    <Button size="sm" variant="secondary">
                      Connect LinkedIn
                    </Button>
                  </Link>
                  <Link href="/api/connections/meta/start">
                    <Button size="sm" variant="secondary">
                      Connect Instagram
                    </Button>
                  </Link>
                </div>
              }
            />
            <CardBody className="space-y-4">
              <AddEmailForm />
              {socials.length === 0 ? (
                <EmptyState
                  icon={<Plug className="h-4 w-4" />}
                  title="No accounts connected"
                  description="Connect X above, or add a Resend email sender to publish by email."
                />
              ) : (
                <ul className="divide-y divide-stone-200">
                  {socials.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-stone-100 text-stone-600">
                        <Plug className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900">
                          @{s.accountHandle}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {s.platform} ·{' '}
                          {s.tokenExpiresAt
                            ? `token valid until ${new Date(s.tokenExpiresAt).toLocaleString()}`
                            : 'no expiry'}
                        </p>
                      </div>
                      <Badge tone={s.status === 'active' ? 'success' : 'warning'} dot>
                        {s.status}
                      </Badge>
                      <DisconnectSocialButton id={s.id} handle={s.accountHandle} />
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
