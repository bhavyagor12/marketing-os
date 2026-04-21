'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Sparkles,
  Megaphone,
  Plug,
  Users,
  Settings,
  Activity,
  UserSquare,
  type LucideIcon,
} from 'lucide-react';
import { cx } from '@/lib/cx';

type NavItem = { href: string; label: string; icon: LucideIcon };

const GROUPS: { heading?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutGrid },
      { href: '/dashboard/activity', label: 'Activity', icon: Activity },
      { href: '/dashboard/campaigns', label: 'Campaigns', icon: Megaphone },
      { href: '/dashboard/leads', label: 'Leads', icon: UserSquare },
      { href: '/dashboard/brand', label: 'Brand', icon: Sparkles },
    ],
  },
  {
    heading: 'Workspace',
    items: [
      { href: '/dashboard/connections', label: 'Connections', icon: Plug },
      { href: '/dashboard/team', label: 'Team', icon: Users },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {GROUPS.map((group, gi) => (
        <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
          {group.heading ? (
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-400">
              {group.heading}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active =
                item.href === '/dashboard'
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cx(
                      'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition',
                      active
                        ? 'bg-stone-900 text-white shadow-sm'
                        : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
                    )}
                  >
                    <Icon
                      className={cx(
                        'h-4 w-4 shrink-0',
                        active ? 'text-white' : 'text-stone-400 group-hover:text-stone-600',
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
