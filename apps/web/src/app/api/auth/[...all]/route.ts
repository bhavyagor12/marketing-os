import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

// Uses postgres-js driver → requires nodejs runtime (not edge).
export const runtime = 'nodejs';

export const { GET, POST } = toNextJsHandler(auth);
