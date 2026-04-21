'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cx } from '@/lib/cx';
import { authClient } from '@/lib/auth-client';

type Role = 'member' | 'admin' | 'owner';

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: 'member', label: 'Member', hint: 'Can draft, comment, approve.' },
  { value: 'admin', label: 'Admin', hint: 'Member + invite people + manage connections.' },
  { value: 'owner', label: 'Owner', hint: 'Full control including billing.' },
];

export function InviteForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const res = await authClient.organization.inviteMember({ email, role });
        if (res.error) {
          setError(res.error.message ?? 'Invite failed');
          return;
        }
        setEmail('');
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invite failed');
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
        Invite
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-md border border-stone-200 bg-stone-50/60 p-4"
    >
      <Input
        label="Email"
        required
        type="email"
        placeholder="teammate@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          Role
        </label>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRole(r.value)}
              className={cx(
                'rounded-md border px-3 py-1.5 text-left transition',
                role === r.value
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300',
              )}
            >
              <span className="block text-sm font-medium">{r.label}</span>
              <span
                className={cx(
                  'mt-0.5 block text-[11px]',
                  role === r.value ? 'text-stone-300' : 'text-stone-500',
                )}
              >
                {r.hint}
              </span>
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-3">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setError(null);
            setEmail('');
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending || !email.trim()}>
          {pending ? 'Sending…' : 'Send invite'}
        </Button>
      </div>
    </form>
  );
}
