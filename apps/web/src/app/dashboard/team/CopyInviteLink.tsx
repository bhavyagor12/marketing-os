'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopyInviteLink({ invitationId }: { invitationId: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/accept-invitation/${invitationId}`
      : `/accept-invitation/${invitationId}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-700 hover:bg-stone-50"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-600" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy link
        </>
      )}
    </button>
  );
}
