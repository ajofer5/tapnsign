import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getWebSessionUser } from './web-session';

export async function requireWebSessionUser() {
  const user = await getWebSessionUser();
  if (!user) {
    const headersList = await headers();
    const path = headersList.get('x-invoke-path') ?? headersList.get('referer') ?? '/app';
    const next = path.startsWith('/') ? path : '/app';
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  return user;
}
