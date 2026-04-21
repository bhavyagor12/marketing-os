import { eq } from 'drizzle-orm';
import { db, organization, PLAN_CONFIG, type BillingPlan } from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { requireOrgSession } from '@/lib/require-session';
import { getOrCreateBilling, getUsageSnapshot } from '@/lib/billing';
import { BillingCard } from './BillingCard';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const sp = await searchParams;
  const { activeOrgId } = await requireOrgSession();
  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, activeOrgId))
    .limit(1);

  const billing = await getOrCreateBilling(activeOrgId);
  const usage = await getUsageSnapshot(activeOrgId, billing);

  const plans = (Object.keys(PLAN_CONFIG) as BillingPlan[]).map((plan) => ({
    plan,
    label: PLAN_CONFIG[plan].label,
    priceUsdCents: PLAN_CONFIG[plan].priceUsdCents,
    quotas: PLAN_CONFIG[plan].quotas,
  }));

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your workspace." />
      <PageBody>
        <div className="max-w-4xl space-y-5">
          {sp.billing === 'success' ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Payment succeeded — your plan updates within a minute once DODO sends the webhook.
            </div>
          ) : sp.billing === 'cancelled' ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Checkout cancelled. No charges were made.
            </div>
          ) : null}

          <Card>
            <CardHeader title="Organization" subtitle="Visible to your teammates." />
            <CardBody className="space-y-4">
              <Input label="Name" defaultValue={org?.name ?? ''} disabled />
              <Input label="Slug" defaultValue={org?.slug ?? ''} disabled />
              <div className="flex justify-end">
                <Button variant="secondary" disabled>Save changes</Button>
              </div>
            </CardBody>
          </Card>

          <BillingCard
            plans={plans}
            currentPlan={billing.plan}
            usage={usage as never}
            status={billing.status}
            currentPeriodEnd={billing.currentPeriodEnd}
            cancelledAt={billing.cancelledAt}
            isDev={process.env.NODE_ENV !== 'production'}
          />

          <Card>
            <CardHeader title="Danger zone" />
            <CardBody>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-stone-900">Delete organization</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Permanently delete this org and all its data.
                  </p>
                </div>
                <Button variant="danger" disabled>Delete</Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
