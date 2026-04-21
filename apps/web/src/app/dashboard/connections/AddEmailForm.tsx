'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Mail, Plus } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { addEmailConnection } from './actions';

export function AddEmailForm() {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [fromName, setFromName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setApiKey('');
    setFromAddress('');
    setFromName('');
    setError(null);
    setOpen(false);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('apiKey', apiKey);
    fd.set('fromAddress', fromAddress);
    if (fromName) fd.set('fromName', fromName);
    start(async () => {
      const res = await addEmailConnection(fd);
      if (res?.error) setError(res.error);
      else reset();
    });
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={<Plus className="h-3.5 w-3.5" />}
        onClick={() => setOpen(true)}
      >
        Connect email (Resend)
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-md border border-stone-200 bg-stone-50/60 p-4"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-stone-900">
        <Mail className="h-4 w-4 text-stone-500" />
        Connect Resend
      </div>
      <Input
        label="Resend API key"
        required
        type="password"
        placeholder="re_…"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />
      <Input
        label="From address"
        required
        type="email"
        placeholder="you@yourdomain.com"
        hint="Domain must be verified in Resend."
        value={fromAddress}
        onChange={(e) => setFromAddress(e.target.value)}
      />
      <Input
        label="From name (optional)"
        placeholder="Your Company"
        value={fromName}
        onChange={(e) => setFromName(e.target.value)}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-3">
        <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending || !apiKey || !fromAddress}>
          {pending ? 'Saving…' : 'Connect'}
        </Button>
      </div>
    </form>
  );
}
