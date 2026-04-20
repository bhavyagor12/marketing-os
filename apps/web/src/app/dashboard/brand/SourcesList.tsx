'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import {
  Globe,
  FileText,
  Trash2,
  Loader2,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { listSources, deleteSource } from './actions';

type Source = {
  id: string;
  kind: 'website' | 'pdf';
  url: string | null;
  filename: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  chunkCount: number;
  pageCount: number;
  error: string | null;
  createdAt: Date | string;
};

export function SourcesList({ initial }: { initial: Source[] }) {
  const [sources, setSources] = useState<Source[]>(initial);
  const [, startDelete] = useTransition();

  const anyInFlight = sources.some((s) => s.status === 'queued' || s.status === 'processing');

  useEffect(() => {
    if (!anyInFlight) return;
    const interval = setInterval(async () => {
      const fresh = (await listSources()) as Source[];
      setSources(fresh);
    }, 2500);
    return () => clearInterval(interval);
  }, [anyInFlight]);

  if (sources.length === 0) {
    return (
      <div className="px-5 py-5">
        <EmptyState
          icon={<FileText className="h-4 w-4" />}
          title="No sources yet"
          description="Add a website URL or upload a PDF to teach Marketing OS your brand voice."
        />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-stone-200">
      {sources.map((s) => {
        const label = s.kind === 'website' ? s.url : s.filename;
        const completed = s.status === 'completed';
        const failed = s.status === 'failed';
        return (
          <li key={s.id} className="group">
            <div className="flex items-center">
              <Link
                href={`/dashboard/brand/sources/${s.id}`}
                className="flex flex-1 items-center gap-3 px-5 py-3 transition hover:bg-stone-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-600 group-hover:bg-white group-hover:ring-1 group-hover:ring-stone-200">
                  {s.kind === 'website' ? (
                    <Globe className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-900">{label}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-stone-500">
                    {completed ? (
                      <>
                        <span>{s.chunkCount} chunks</span>
                        {s.pageCount > 1 ? <span>· {s.pageCount} pages</span> : null}
                      </>
                    ) : failed ? (
                      <>
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                        <span className="truncate text-red-600">{s.error ?? 'Failed'}</span>
                      </>
                    ) : (
                      <span>Working…</span>
                    )}
                  </p>
                </div>
                <StatusBadge status={s.status} />
                <ChevronRight className="ml-1 h-4 w-4 text-stone-300 transition group-hover:text-stone-500" />
              </Link>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  startDelete(async () => {
                    setSources((prev) => prev.filter((x) => x.id !== s.id));
                    await deleteSource(s.id);
                  });
                }}
                className="mr-3 rounded p-1.5 text-stone-400 opacity-0 transition hover:bg-stone-100 hover:text-stone-700 group-hover:opacity-100"
                aria-label="Delete source"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StatusBadge({ status }: { status: Source['status'] }) {
  if (status === 'completed') return <Badge tone="success" dot>Ready</Badge>;
  if (status === 'failed') return <Badge tone="danger" dot>Failed</Badge>;
  if (status === 'processing')
    return (
      <Badge tone="info">
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing
      </Badge>
    );
  return (
    <Badge tone="neutral">
      <Loader2 className="h-3 w-3 animate-spin" />
      Queued
    </Badge>
  );
}
