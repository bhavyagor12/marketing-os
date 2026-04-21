'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { saveBrandIdentity } from './edit-actions';

type Identity = {
  tradingName?: string;
  tagline?: string;
  mission?: string;
  vision?: string;
  foundingStory?: string;
  foundedYear?: number;
  category?: string;
  subCategory?: string;
  stage?: string;
  hqLocation?: string;
  markets?: string[];
};

export function EditIdentityCard({ initial }: { initial: Identity }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Identity>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveBrandIdentity(values);
      if (res?.error) setError(res.error);
      else setEditing(false);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Identity
        </h3>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs text-stone-600 hover:text-stone-900"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        ) : null}
      </div>

      {!editing ? (
        <ReadView i={values} />
      ) : (
        <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-stone-200 bg-stone-50/60 p-4">
          <Input
            label="Trading name"
            value={values.tradingName ?? ''}
            onChange={(e) => setValues({ ...values, tradingName: e.target.value })}
          />
          <Input
            label="Tagline"
            value={values.tagline ?? ''}
            onChange={(e) => setValues({ ...values, tagline: e.target.value })}
          />
          <TextArea
            label="Mission"
            value={values.mission ?? ''}
            onChange={(v) => setValues({ ...values, mission: v })}
          />
          <TextArea
            label="Vision"
            value={values.vision ?? ''}
            onChange={(v) => setValues({ ...values, vision: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Category"
              value={values.category ?? ''}
              onChange={(e) => setValues({ ...values, category: e.target.value })}
            />
            <Input
              label="Stage"
              value={values.stage ?? ''}
              onChange={(e) => setValues({ ...values, stage: e.target.value })}
            />
            <Input
              label="HQ"
              value={values.hqLocation ?? ''}
              onChange={(e) => setValues({ ...values, hqLocation: e.target.value })}
            />
            <Input
              label="Founded year"
              type="number"
              value={values.foundedYear ?? ''}
              onChange={(e) =>
                setValues({
                  ...values,
                  foundedYear: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </div>
          <TextArea
            label="Founding story"
            value={values.foundingStory ?? ''}
            onChange={(v) => setValues({ ...values, foundingStory: v })}
            rows={4}
          />
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              leadingIcon={<X className="h-3.5 w-3.5" />}
              onClick={() => {
                setValues(initial);
                setEditing(false);
                setError(null);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              leadingIcon={<Save className="h-3.5 w-3.5" />}
              disabled={pending}
            >
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function ReadView({ i }: { i: Identity }) {
  return (
    <div className="space-y-2.5">
      {i.tagline ? (
        <p className="text-base font-medium italic text-stone-900">&ldquo;{i.tagline}&rdquo;</p>
      ) : null}
      {i.mission ? <Line label="Mission" value={i.mission} /> : null}
      {i.vision ? <Line label="Vision" value={i.vision} /> : null}
      <div className="grid grid-cols-2 gap-2 pt-1">
        {i.category ? <Chip label="Category" value={i.category} /> : null}
        {i.stage ? <Chip label="Stage" value={i.stage} /> : null}
        {i.hqLocation ? <Chip label="HQ" value={i.hqLocation} /> : null}
        {i.foundedYear ? <Chip label="Founded" value={String(i.foundedYear)} /> : null}
      </div>
      {!i.mission && !i.tagline ? (
        <p className="text-sm italic text-stone-500">
          No identity set yet. Click Edit to add your mission, tagline, and category.
        </p>
      ) : null}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-stone-800">{value}</p>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-stone-900">{value}</p>
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
        {label}
      </label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
      />
    </div>
  );
}
