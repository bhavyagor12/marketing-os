import { eq } from 'drizzle-orm';
import { db, organization } from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { requireOrgSession } from '@/lib/require-session';

export default async function SettingsPage() {
  const { activeOrgId } = await requireOrgSession();
  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, activeOrgId))
    .limit(1);

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your workspace." />
      <PageBody>
        <div className="max-w-2xl space-y-5">
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
