import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Marketing OS',
  description: 'AI Marketing Operating System',
};

// Inline script that runs before React hydration to avoid a light→dark flash. Reads
// the stored preference (or system preference) and applies the .dark class to <html>.
const NO_FLASH_SCRIPT = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-white text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-100">
        {children}
      </body>
    </html>
  );
}
