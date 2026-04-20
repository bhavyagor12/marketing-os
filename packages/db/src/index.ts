import { config } from 'dotenv';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Load monorepo-root .env so this package is self-sufficient regardless of how it's imported.
// Callers run with cwd = their own package dir (apps/web, apps/worker, packages/db), and in all
// of those ../../.env resolves to the repo root.
config({ path: resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const client = postgres(databaseUrl, { prepare: false });

export const db = drizzle(client, { schema });
export { schema };
export type DB = typeof db;
export * from './schema';
