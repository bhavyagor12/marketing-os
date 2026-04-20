import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Command, ArrowRight } from 'lucide-react';
import { auth } from '@/lib/auth';

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/dashboard');

  return (
    <main className="flex min-h-dvh flex-col bg-stone-50">
      <nav className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-stone-800 to-stone-950 text-white shadow-sm">
            <Command className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-stone-900">Marketing OS</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/signin" className="text-stone-600 hover:text-stone-900">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 font-medium text-white shadow-sm hover:bg-stone-800"
          >
            Get started
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      <section className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            AI Marketing Operating System
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
            Git for your marketing.
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base text-stone-600 sm:text-lg">
            Version-controlled campaigns, on-brand AI agents, and real publishing.
            One workspace for your entire team.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-stone-800"
            >
              Create your workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/signin"
              className="inline-flex items-center rounded-md border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 shadow-sm hover:bg-stone-50"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-200 bg-white px-6 py-5 text-center text-xs text-stone-500">
        Built with Claude · self-hosted · BYO keys
      </footer>
    </main>
  );
}
