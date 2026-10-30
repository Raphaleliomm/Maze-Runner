import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// RPC argument shapes are validated by Postgres; this client uses the dynamic RPC boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: ReturnType<typeof createClient<any>> | undefined;

export function supabase() {
  if (!url || !key) throw new Error('Supabase is not configured. Add the public URL and anon key to your environment.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client ??= createClient<any>(url, key);
}

export async function ensureIdentity() {
  const db = supabase();
  const { data: { session }, error } = await db.auth.getSession();
  if (error) throw error;
  if (!session) {
    const { error: signInError } = await db.auth.signInAnonymously();
    if (signInError) throw signInError;
  }
  return db;
}

export async function action(name: string, args: Record<string, unknown>) {
  const db = await ensureIdentity();
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'Something went wrong. Please try again.';
}

