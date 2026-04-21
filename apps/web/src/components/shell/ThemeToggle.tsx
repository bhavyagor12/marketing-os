'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cx } from '@/lib/cx';

type Theme = 'light' | 'dark';

function readTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem('theme') as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  window.localStorage.setItem('theme', theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle color theme"
      className={cx(
        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition',
        'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
        'dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100',
      )}
    >
      {mounted && theme === 'dark' ? (
        <>
          <Sun className="h-4 w-4" />
          <span className="flex-1 text-left">Light mode</span>
        </>
      ) : (
        <>
          <Moon className="h-4 w-4" />
          <span className="flex-1 text-left">Dark mode</span>
        </>
      )}
    </button>
  );
}
