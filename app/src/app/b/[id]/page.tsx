import { BountyDetail } from "@/components/BountyDetail";

// This page is entirely dynamic (wallet state, Realtime, a live countdown) —
// there's no meaningful static shell to prerender, so it's a blocking route
// rather than fighting Cache Components to stream a page with no cacheable
// content anyway. (Route segment config — must live in a Server Component
// file, hence this thin wrapper delegating to a client component.)
export const instant = false;

export default async function BountyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BountyDetail id={id} />;
}
