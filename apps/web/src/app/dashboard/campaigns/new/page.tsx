import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { requireOrgSession } from '@/lib/require-session';
import { BriefForm } from './BriefForm';

export default async function NewCampaignPage() {
  await requireOrgSession();
  return (
    <>
      <PageHeader
        title="New campaign"
        subtitle="Describe the outcome. The planner agent turns this brief into a structured plan."
        actions={
          <Link href="/dashboard/campaigns">
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<ArrowLeft className="h-3.5 w-3.5" />}
            >
              Back
            </Button>
          </Link>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardBody>
              <BriefForm />
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
