import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

export function Card({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'rounded-lg border border-stone-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx('px-5 py-4', className)}>{children}</div>;
}

export function CardFooter({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        'flex items-center justify-end gap-2 border-t border-stone-200 px-5 py-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
