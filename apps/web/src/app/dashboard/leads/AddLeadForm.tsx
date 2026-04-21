'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { addLead } from './actions';

export function AddLeadForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setOpen(false);
    setError(null);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const res = await addLead(fd);
      if (res?.error) setError(res.error);
      else {
        (e.target as HTMLFormElement).reset();
        reset();
      }
    });
  }

  if (!open) {
    return (
      <Button
        size="sm"
        leadingIcon={<UserPlus className="h-3.5 w-3.5" />}
        onClick={() => setOpen(true)}
      >
        Add lead
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-md border border-stone-200 bg-stone-50/60 p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Email" name="email" type="email" required placeholder="dana@acme.com" />
        <Input label="Company" name="company" placeholder="Acme Corp" />
        <Input label="First name" name="firstName" placeholder="Dana" />
        <Input label="Last name" name="lastName" placeholder="Lin" />
        <Input label="Title" name="title" placeholder="Head of Marketing" />
        <Input label="LinkedIn" name="linkedinUrl" placeholder="https://linkedin.com/in/…" />
      </div>
      <Input label="Tags (comma-separated)" name="tags" placeholder="saas, mid-market" />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-3">
        <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Add lead'}
        </Button>
      </div>
    </form>
  );
}
