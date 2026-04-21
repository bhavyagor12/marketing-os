'use client';

import { useState, useTransition, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cx } from '@/lib/cx';
import { importLeadsCsv } from './actions';

export function ImportCsvForm() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [summary, setSummary] = useState<{ inserted: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  function onSubmit() {
    if (!file) return;
    setError(null);
    setSummary(null);
    const fd = new FormData();
    fd.set('file', file);
    start(async () => {
      const res = await importLeadsCsv(fd);
      if (res?.error) setError(res.error);
      else if (res?.ok) {
        setSummary({ inserted: res.inserted, skipped: res.skipped });
        setFile(null);
      }
    });
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        htmlFor="csv-input"
        className={cx(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-6 text-center transition',
          dragOver
            ? 'border-stone-900 bg-stone-50'
            : 'border-stone-300 bg-stone-50/50 hover:border-stone-400',
        )}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-stone-600 ring-1 ring-stone-200">
          <Upload className="h-4 w-4" />
        </div>
        <p className="text-sm font-medium text-stone-900">
          {file ? file.name : 'Drop a CSV here, or click to select'}
        </p>
        <p className="text-xs text-stone-500">
          Needs an <code className="font-mono">email</code> column. Accepts
          {' '}<code className="font-mono">first_name</code>,{' '}
          <code className="font-mono">last_name</code>, <code className="font-mono">company</code>,
          {' '}<code className="font-mono">title</code>, <code className="font-mono">linkedin_url</code>,
          {' '}<code className="font-mono">tags</code>. Existing emails update in place.
        </p>
        <input
          id="csv-input"
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
          }}
        />
      </label>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {summary ? (
        <p className="mt-2 text-xs text-emerald-700">
          Imported {summary.inserted.toLocaleString()} rows. Skipped {summary.skipped}.
        </p>
      ) : null}
      {file ? (
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
            Clear
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? 'Importing…' : 'Import CSV'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
