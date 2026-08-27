import { FriendWatchlist } from "@/components/community/friend-watchlist";

export default async function FriendWatchlistPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <FriendWatchlist username={decodeURIComponent(username)} />;
}
