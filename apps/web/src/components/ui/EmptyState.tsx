import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 bg-stone-50/50 px-6 py-12 text-center">
      {icon ? (
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-md bg-white text-stone-500 ring-1 ring-stone-200">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
      {description ? (
        <p className="max-w-sm text-sm text-stone-500">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
