import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  leadingAdornment?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, hint, error, leadingAdornment, className, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <div className="w-full">
      {label ? (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600"
        >
          {label}
        </label>
      ) : null}
      <div className="relative">
        {leadingAdornment ? (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
            {leadingAdornment}
          </div>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cx(
            'h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-900 placeholder:text-stone-400 shadow-sm transition',
            'focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10',
            'disabled:bg-stone-50 disabled:text-stone-500',
            leadingAdornment ? 'pl-9' : '',
            error ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' : '',
            className,
          )}
          {...rest}
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-stone-500">{hint}</p>
      ) : null}
    </div>
  );
});
