'use client';

import { useState, useTransition, type DragEvent } from 'react';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cx } from '@/lib/cx';
import { addPdfSource } from './actions';

export function UploadPdfForm() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  function onSubmit() {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set('file', file);
    startTransition(async () => {
      const res = await addPdfSource(fd);
      if (res?.error) setError(res.error);
      else setFile(null);
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
        htmlFor="pdf-input"
        className={cx(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition',
          dragOver
            ? 'border-stone-900 bg-stone-50'
            : 'border-stone-300 bg-stone-50/50 hover:border-stone-400 hover:bg-stone-50',
        )}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-stone-600 ring-1 ring-stone-200">
          <FileUp className="h-4 w-4" />
        </div>
        <p className="text-sm font-medium text-stone-900">
          {file ? file.name : 'Drop a PDF here, or click to select'}
        </p>
        <p className="text-xs text-stone-500">
          Up to 25MB · text-based PDFs (scans won&apos;t work)
        </p>
        <input
          id="pdf-input"
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
          }}
        />
      </label>

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      {file ? (
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
            Clear
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? 'Uploading…' : 'Ingest PDF'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
