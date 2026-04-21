'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { saveBrandVoice } from './edit-actions';

type Voice = {
  attributes?: string[];
  avoid?: string[];
  signaturePhrases?: string[];
  styleNotes?: string;
  examples?: { label: string; text: string }[];
  pointOfView?: string;
  lexicon?: { preferred: string; instead_of?: string }[];
};

export function EditVoiceCard({ initial }: { initial: Voice }) {
  const [editing, setEditing] = useState(false);
  const [attributesStr, setAttributesStr] = useState((initial.attributes ?? []).join(', '));
  const [avoidStr, setAvoidStr] = useState((initial.avoid ?? []).join(', '));
  const [signatureStr, setSignatureStr] = useState((initial.signaturePhrases ?? []).join('\n'));
  const [styleNotes, setStyleNotes] = useState(initial.styleNotes ?? '');
  const [pov, setPov] = useState(initial.pointOfView ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const next: Voice = {
      ...initial,
      attributes: attributesStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      avoid: avoidStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      signaturePhrases: signatureStr
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean),
      styleNotes: styleNotes.trim() || undefined,
      pointOfView: pov.trim() || undefined,
    };
    start(async () => {
      const res = await saveBrandVoice(next);
      if (res?.error) setError(res.error);
      else setEditing(false);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Voice
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
        <ReadView v={initial} />
      ) : (
        <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-stone-200 bg-stone-50/60 p-4">
          <Field label="Attributes (comma-separated)">
            <input
              value={attributesStr}
              onChange={(e) => setAttributesStr(e.target.value)}
              placeholder="confident, warm, technical"
              className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
            />
          </Field>
          <Field label="Avoid (comma-separated)">
            <input
              value={avoidStr}
              onChange={(e) => setAvoidStr(e.target.value)}
              placeholder="corporate-speak, hype, buzzwords"
              className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
            />
          </Field>
          <Field label="Signature phrases (one per line)">
            <textarea
              rows={3}
              value={signatureStr}
              onChange={(e) => setSignatureStr(e.target.value)}
              placeholder={'Ship it.\nDon\'t overthink it.'}
              className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
            />
          </Field>
          <Field label="Point of view">
            <select
              value={pov}
              onChange={(e) => setPov(e.target.value)}
              className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
            >
              <option value="">—</option>
              <option value="we">We / us (team voice)</option>
              <option value="brand-as-entity">Brand as entity</option>
              <option value="founder-first">Founder-first</option>
              <option value="customer-first">Customer-first</option>
            </select>
          </Field>
          <Field label="Style notes">
            <textarea
              rows={3}
              value={styleNotes}
              onChange={(e) => setStyleNotes(e.target.value)}
              className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
            />
          </Field>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              leadingIcon={<X className="h-3.5 w-3.5" />}
              onClick={() => setEditing(false)}
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

function ReadView({ v }: { v: Voice }) {
  const nothing =
    !v.attributes?.length &&
    !v.avoid?.length &&
    !v.signaturePhrases?.length &&
    !v.styleNotes &&
    !v.pointOfView;
  if (nothing) {
    return (
      <p className="text-sm italic text-stone-500">
        No voice set yet. Click Edit to define attributes, things to avoid, and signature phrases.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {v.attributes?.length ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
            Attributes
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {v.attributes.map((a) => (
              <Badge key={a} tone="info">
                {a}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {v.avoid?.length ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
            Avoid
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {v.avoid.map((a) => (
              <Badge key={a} tone="danger">
                {a}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {v.signaturePhrases?.length ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
            Signature phrases
          </p>
          <ul className="mt-1.5 space-y-1">
            {v.signaturePhrases.map((s, i) => (
              <li key={i} className="text-sm italic text-stone-700">
                &ldquo;{s}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {v.pointOfView ? (
        <p className="text-xs text-stone-500">
          <span className="font-semibold uppercase tracking-wide">POV:</span> {v.pointOfView}
        </p>
      ) : null}
      {v.styleNotes ? (
        <p className="text-sm text-stone-700">{v.styleNotes}</p>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
        {label}
      </label>
      {children}
    </div>
  );
}
