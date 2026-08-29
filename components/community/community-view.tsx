"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, UserPlus, Check, X, Clock, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Friend = { id: string; username: string };
type Incoming = { requestId: string; id: string; username: string };

type RequestRow = {
  id: string;
  status: string;
  requester_id: string;
  recipient_id: string;
  requester: { username: string | null } | null;
  recipient: { username: string | null } | null;
};

function initialsFor(username: string) {
  return username.slice(0, 2).toUpperCase();
}

function UserAvatar({ username }: { username: string }) {
  return (
    <Avatar>
      <AvatarFallback className="bg-accent text-accent-foreground">
        {initialsFor(username)}
      </AvatarFallback>
    </Avatar>
  );
}

export function CommunityView() {
  const [supabase] = useState(() => createClient());
  const [me, setMe] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [outgoingIds, setOutgoingIds] = useState<Set<string>>(new Set());

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Friend[]>([]);
  const [searching, setSearching] = useState(false);

  const loadAll = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Signed out: nothing here works without an account, so leave the lists
    // empty and let the view offer to make one.
    if (!user) {
      setMe(null);
      setFriends([]);
      setIncoming([]);
      setOutgoingIds(new Set());
      setReady(true);
      return;
    }
    setMe(user.id);

    const { data } = await supabase
      .from("friend_requests")
      .select(
        "id, status, requester_id, recipient_id, requester:profiles!requester_id(username), recipient:profiles!recipient_id(username)",
      );

    const rows = (data ?? []) as unknown as RequestRow[];
    const nextFriends: Friend[] = [];
    const nextIncoming: Incoming[] = [];
    const nextOutgoing = new Set<string>();

    for (const row of rows) {
      const iAmRequester = row.requester_id === user.id;
      const otherId = iAmRequester ? row.recipient_id : row.requester_id;
      const otherName =
        (iAmRequester ? row.recipient?.username : row.requester?.username) ??
        "unknown";

      if (row.status === "accepted") {
        nextFriends.push({ id: otherId, username: otherName });
      } else if (row.status === "pending") {
        if (iAmRequester) {
          nextOutgoing.add(otherId);
        } else {
          nextIncoming.push({
            requestId: row.id,
            id: otherId,
            username: otherName,
          });
        }
      }
    }

    setFriends(nextFriends);
    setIncoming(nextIncoming);
    setOutgoingIds(nextOutgoing);
    setReady(true);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial async data load
    loadAll();
    // Signing in from the prompt below has to swap this page over, otherwise
    // the reader is left looking at the sign-up card they just acted on.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => loadAll());
    return () => subscription.unsubscribe();
  }, [loadAll, supabase]);

  // Debounced username search.
  useEffect(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear results when query is emptied
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("profiles")
        .select("id, username")
        .ilike("username", `%${term}%`)
        .neq("id", me ?? "")
        .not("username", "is", null)
        .limit(10);
      setResults((data ?? []) as Friend[]);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, me, supabase]);

  const friendIds = useMemo(
    () => new Set(friends.map((f) => f.id)),
    [friends],
  );
  const incomingIds = useMemo(
    () => new Set(incoming.map((i) => i.id)),
    [incoming],
  );

  async function sendRequest(userId: string) {
    if (!me) return;
    setOutgoingIds((prev) => new Set(prev).add(userId));
    await supabase
      .from("friend_requests")
      .insert({ requester_id: me, recipient_id: userId });
    loadAll();
  }

  async function accept(requestId: string) {
    await supabase
      .from("friend_requests")
      .update({ status: "accepted" })
      .eq("id", requestId);
    loadAll();
  }

  async function decline(requestId: string) {
    await supabase.from("friend_requests").delete().eq("id", requestId);
    loadAll();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Community</h1>
        <p className="text-sm text-muted-foreground">
          Find friends by username and see each other&apos;s watchlists.
        </p>
      </div>

      {/* Guests get the prompt instead of the search: friends live on an
          account, so every control below would be dead in their hands. */}
      {ready && !me && (
        <Card className="gap-4 p-6">
          <div>
            <p className="text-base font-semibold">
              To add friends, create a free account
            </p>
            <p className="text-sm text-muted-foreground">
              Friends and requests are saved to your account, so they follow you
              to any device. Free, and it takes a minute.
            </p>
          </div>
          <Link
            href="/account"
            className={cn(buttonVariants(), "w-fit rounded-full")}
          >
            Create a free account
          </Link>
        </Card>
      )}

      {me && (
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search people by username"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCapitalize="none"
            className="pl-9"
          />
        </div>
      )}

      {query.trim() && (
        <Card className="gap-3 p-6">
          <h3 className="text-base font-semibold">Search results</h3>
          {searching && results.length === 0 ? (
            <p className="text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No one found with that username.
            </p>
          ) : (
            <div className="flex flex-col">
              {results.map((person) => {
                const isFriend = friendIds.has(person.id);
                const isIncoming = incomingIds.has(person.id);
                const isOutgoing = outgoingIds.has(person.id);
                return (
                  <div
                    key={person.id}
                    className="flex items-center justify-between rounded-xl px-2 py-2.5 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar username={person.username} />
                      <p className="text-sm font-semibold">
                        @{person.username}
                      </p>
                    </div>
                    {isFriend ? (
                      <span className="text-xs font-medium text-gain">
                        Friends
                      </span>
                    ) : isOutgoing ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3.5" /> Requested
                      </span>
                    ) : isIncoming ? (
                      <span className="text-xs text-muted-foreground">
                        Wants to connect — see below
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        className="rounded-full"
                        onClick={() => sendRequest(person.id)}
                      >
                        <UserPlus className="size-4" />
                        Add friend
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {incoming.length > 0 && (
        <Card className="gap-3 p-6">
          <h3 className="text-base font-semibold">
            Friend requests ({incoming.length})
          </h3>
          <div className="flex flex-col">
            {incoming.map((person) => (
              <div
                key={person.requestId}
                className="flex items-center justify-between rounded-xl px-2 py-2.5 hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar username={person.username} />
                  <p className="text-sm">
                    <span className="font-semibold">@{person.username}</span>{" "}
                    <span className="text-muted-foreground">
                      sent you a friend request
                    </span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="icon"
                    className="size-8 rounded-full"
                    aria-label="Accept"
                    onClick={() => accept(person.requestId)}
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8 rounded-full"
                    aria-label="Decline"
                    onClick={() => decline(person.requestId)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {me && (
        <Card className="gap-3 p-6">
          <h3 className="text-base font-semibold">
            My friends ({friends.length})
          </h3>
          {friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No friends yet. Search a username above to send a request.
            </p>
          ) : (
            <div className="flex flex-col">
              {friends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center justify-between rounded-xl px-2 py-2.5 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar username={friend.username} />
                    <p className="text-sm font-semibold">@{friend.username}</p>
                  </div>
                  <Link
                    href={`/community/${friend.username}`}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    <Eye className="size-4" />
                    View watchlist
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
