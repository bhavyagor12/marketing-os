import { Command } from 'lucide-react';

export function OrgBadge({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-stone-800 to-stone-950 text-white shadow-sm">
        <Command className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-stone-900">{name}</span>
        <span className="block text-[10px] font-medium uppercase tracking-wide text-stone-400">
          Marketing OS
        </span>
      </span>
    </div>
  );
}
