import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { requireOrgSession } from '@/lib/require-session';
import { listEmailConnections } from '../actions';
import { NewSequenceForm } from './NewSequenceForm';

export default async function NewSequencePage() {
  await requireOrgSession();
  const connections = await listEmailConnections();
  return (
    <>
      <PageHeader
        title="New sequence"
        subtitle="Name the campaign, pick a sender. You'll add templated steps next."
        actions={
          <Link href="/dashboard/sequences">
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
              <NewSequenceForm connections={connections as never} />
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
