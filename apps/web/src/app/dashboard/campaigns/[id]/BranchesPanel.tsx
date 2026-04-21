'use client';

import Link from 'next/link';
import { useState, useTransition, type FormEvent } from 'react';
import { GitBranch, Plus } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { createBranch } from '../branch-actions';

export type BranchRow = {
  id: string;
  name: string;
  headCommitId: string | null;
  headMessage: string | null;
  headContentHash: string | null;
  headCreatedAt: Date | string | null;
  commitCount: number;
};

export function BranchesPanel({
  campaignId,
  branches,
}: {
  campaignId: string;
  branches: BranchRow[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createBranch({ campaignId, name });
      if (res?.error) setError(res.error);
      else {
        setName('');
        setOpen(false);
      }
    });
  }

  return (
    <Card>
      <CardHeader
        title="Branches"
        subtitle={`${branches.length} branch${branches.length === 1 ? '' : 'es'}`}
        action={
          !open ? (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setOpen(true)}
            >
              New branch
            </Button>
          ) : null
        }
      />
      <CardBody className="space-y-3">
        {open ? (
          <form
            onSubmit={onSubmit}
            className="space-y-3 rounded-md border border-stone-200 bg-stone-50/60 p-3 dark:border-stone-700 dark:bg-stone-800/40"
          >
            <Input
              label="Branch name"
              placeholder="e.g. q2-launch"
              value={name}
              onChange={(e) => setName(e.target.value)}
              hint="Branches off the current main HEAD."
            />
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setName('');
                  setError(null);
                }}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending || !name.trim()}>
                {pending ? 'Creating…' : 'Create branch'}
              </Button>
            </div>
          </form>
        ) : null}

        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {branches.map((b) => (
            <li key={b.id} className="flex items-start gap-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400">
                <GitBranch className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-stone-900 dark:text-stone-100">
                    {b.name}
                  </span>
                  {b.name === 'main' ? <Badge tone="info">default</Badge> : null}
                  <Badge tone="neutral">
                    {b.commitCount} commit{b.commitCount === 1 ? '' : 's'}
                  </Badge>
                </div>
                {b.headCommitId ? (
                  <Link
                    href={`/dashboard/campaigns/${campaignId}/commits/${b.headCommitId}`}
                    className="mt-0.5 block truncate text-xs text-stone-500 hover:text-stone-900 hover:underline dark:text-stone-400 dark:hover:text-stone-100"
                  >
                    <span className="font-mono">{(b.headContentHash ?? '').slice(0, 7)}</span>{' '}
                    {b.headMessage ?? 'no message'}
                  </Link>
                ) : (
                  <p className="mt-0.5 text-xs italic text-stone-400 dark:text-stone-500">
                    no commits yet
                  </p>
                )}
              </div>
              {b.headCreatedAt ? (
                <span className="shrink-0 text-[11px] text-stone-400 dark:text-stone-500">
                  {new Date(b.headCreatedAt).toLocaleDateString()}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
