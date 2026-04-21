'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { editCommitContent } from '../../../actions';

export function EditCommitForm({
  campaignId,
  commitId,
  initialText,
}: {
  campaignId: string;
  commitId: string;
  initialText: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty = text !== initialText;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await editCommitContent(commitId, text, message || null);
      if (res?.error) {
        setError(res.error);
        return;
      }
      if (res?.commitId) {
        router.push(`/dashboard/campaigns/${campaignId}/commits/${res.commitId}`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <textarea
        rows={Math.max(6, Math.min(30, text.split('\n').length + 2))}
        className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 font-mono text-sm leading-relaxed shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Input
        label="Commit message"
        placeholder="e.g. Tightened hook, removed jargon"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={!dirty || pending}
          leadingIcon={<Save className="h-3.5 w-3.5" />}
        >
          {pending ? 'Saving…' : 'Save as new commit'}
        </Button>
      </div>
    </form>
  );
}
