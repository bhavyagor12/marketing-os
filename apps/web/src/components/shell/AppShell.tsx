import type { ReactNode } from 'react';
import { OrgBadge } from './OrgBadge';
import { SidebarNav } from './SidebarNav';
import { UserMenu } from './UserMenu';
import { NotificationsBell } from './NotificationsBell';
import { ThemeToggle } from './ThemeToggle';

export function AppShell({
  children,
  user,
  orgName,
}: {
  children: ReactNode;
  user: { name: string; email: string };
  orgName: string;
}) {
  return (
    <div className="flex h-dvh bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="border-b border-stone-200 px-3 py-3 dark:border-stone-800">
          <OrgBadge name={orgName} />
        </div>
        <SidebarNav />
        <div className="border-t border-stone-200 p-2 dark:border-stone-800">
          <NotificationsBell />
        </div>
        <div className="border-t border-stone-200 p-2 dark:border-stone-800">
          <ThemeToggle />
        </div>
        <div className="border-t border-stone-200 p-2 dark:border-stone-800">
          <UserMenu name={user.name} email={user.email} />
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-200 bg-white/95 px-8 py-5 backdrop-blur dark:border-stone-800 dark:bg-stone-900/80">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-8 py-8">{children}</div>
    </div>
  );
}
