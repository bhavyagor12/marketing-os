'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Command } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authClient } from '@/lib/auth-client';

function toSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const signUpRes = await authClient.signUp.email({ email, password, name });
      if (signUpRes.error) throw new Error(signUpRes.error.message ?? 'signup failed');

      const slug = toSlug(orgName) || `org-${Date.now()}`;
      const orgRes = await authClient.organization.create({ name: orgName, slug });
      if (orgRes.error) throw new Error(orgRes.error.message ?? 'org creation failed');

      await authClient.organization.setActive({ organizationId: orgRes.data!.id });

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-stone-800 to-stone-950 text-white shadow-sm">
            <Command className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-stone-900">Marketing OS</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Create account</h1>
        <p className="mt-1 text-sm text-stone-500">You&apos;ll also set up your first organization.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Input
            label="Your name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Organization"
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            hint="Shown in your workspace sidebar."
          />
          <Input
            label="Email"
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            required
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="Minimum 8 characters."
            error={error}
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-sm text-stone-500">
          Already have an account?{' '}
          <Link className="font-medium text-stone-900 underline underline-offset-2" href="/signin">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
