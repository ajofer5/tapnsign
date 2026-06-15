import { redirect } from 'next/navigation';

export default async function OfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/autograph/${id}`);
}
