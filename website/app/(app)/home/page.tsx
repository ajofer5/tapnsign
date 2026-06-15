import { redirect } from 'next/navigation';
import { requireWebSessionUser } from '../../../lib/web-auth';

export const dynamic = 'force-dynamic';

export default async function WebAppHomePage() {
  const user = await requireWebSessionUser();
  redirect(`/profile/${user.id}`);
}
