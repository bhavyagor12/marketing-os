'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Globe } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { addWebsiteSource } from './actions';

export function AddWebsiteForm() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('url', url);
    startTransition(async () => {
      const res = await addWebsiteSource(fd);
      if (res?.error) setError(res.error);
      else setUrl('');
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <div className="flex-1">
        <Input
          name="url"
          placeholder="https://yourcompany.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          leadingAdornment={<Globe className="h-4 w-4" />}
          error={error}
          required
        />
      </div>
      <Button type="submit" disabled={pending || !url.trim()}>
        {pending ? 'Queuing…' : 'Scan site'}
      </Button>
    </form>
  );
}
