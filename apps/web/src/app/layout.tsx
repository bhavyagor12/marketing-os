import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Marketing OS',
  description: 'AI Marketing Operating System',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
