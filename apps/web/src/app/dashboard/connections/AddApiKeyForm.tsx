'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { KeyRound, Plus, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cx } from '@/lib/cx';
import { addAiProviderKey } from './actions';

type Provider = 'anthropic' | 'openai' | 'voyage' | 'heygen';

export function AddApiKeyForm() {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setLabel('');
    setKey('');
    setShow(false);
    setError(null);
    setOpen(false);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('provider', provider);
    if (label) fd.set('label', label);
    fd.set('key', key);
    start(async () => {
      const res = await addAiProviderKey(fd);
      if (res?.error) setError(res.error);
      else reset();
    });
  }

  if (!open) {
    return (
      <Button
        size="sm"
        leadingIcon={<Plus className="h-3.5 w-3.5" />}
        onClick={() => setOpen(true)}
      >
        Add key
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-md border border-stone-200 bg-stone-50/60 p-4"
    >
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          Provider
        </label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: 'anthropic', label: 'Anthropic', disabled: false, tag: 'agents' },
              { value: 'openai', label: 'OpenAI', disabled: false, tag: 'images' },
              { value: 'voyage', label: 'Voyage', disabled: false, tag: 'embeddings' },
              { value: 'heygen', label: 'HeyGen', disabled: false, tag: 'video' },
            ] as { value: Provider; label: string; disabled: boolean; tag: string | null }[]
          ).map((p) => {
            const active = p.value === provider;
            return (
              <button
                key={p.value}
                type="button"
                disabled={p.disabled}
                onClick={() => setProvider(p.value)}
                className={cx(
                  'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition',
                  active
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300',
                  p.disabled && 'opacity-50 cursor-not-allowed',
                )}
              >
                {p.label}
                {p.tag ? (
                  <span className="text-[10px] uppercase tracking-wide opacity-70">
                    {p.tag}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <Input
        label="Label (optional)"
        placeholder="e.g. Production key"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          API key
        </label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
            <KeyRound className="h-4 w-4" />
          </div>
          <input
            required
            type={show ? 'text' : 'password'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              provider === 'anthropic'
                ? 'sk-ant-api03-…'
                : provider === 'voyage'
                  ? 'pa-…'
                  : provider === 'heygen'
                    ? 'Your HeyGen API key'
                    : 'sk-…'
            }
            className="h-9 w-full rounded-md border border-stone-200 bg-white pl-9 pr-10 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-stone-400 hover:text-stone-700"
            aria-label={show ? 'Hide' : 'Show'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-stone-500">
          Encrypted with AES-256-GCM before storage. Only the last 4 chars are visible after save.
        </p>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending || !key}>
          {pending ? 'Saving…' : 'Save key'}
        </Button>
      </div>
    </form>
  );
}
