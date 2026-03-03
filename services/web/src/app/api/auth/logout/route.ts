import { signOut } from '@/lib/auth/auth-config';

export const dynamic = 'force-dynamic';

export async function POST() {
  await signOut({ redirect: false });
  return Response.json({ ok: true });
}
