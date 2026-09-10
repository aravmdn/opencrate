import { cookies } from "next/headers";
import { mapSpotifyItems, parseSpotifyPlaylistId } from "@/lib/spotify";
import type { PlaylistTrack } from "@/lib/types";

type PlaylistResponse = {
  items?: Parameters<typeof mapSpotifyItems>[0];
  next?: string | null;
  error?: { message?: string };
};

export async function GET(request: Request) {
  const playlistUrl = new URL(request.url).searchParams.get("url") || "";
  const id = parseSpotifyPlaylistId(playlistUrl);
  if (!id) return Response.json({ error: "Paste a valid Spotify playlist URL." }, { status: 400 });

  const store = await cookies();
  const token = store.get("opencrate_spotify_access")?.value;
  if (!token) {
    return Response.json({ error: "Connect Spotify before importing.", needsAuth: true }, { status: 401 });
  }

  const tracks: PlaylistTrack[] = [];
  let nextUrl: string | null = `https://api.spotify.com/v1/playlists/${id}/items?limit=50&market=from_token`;

  while (nextUrl && tracks.length < 100) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const data = (await response.json()) as PlaylistResponse;
    if (!response.ok) {
      if (response.status === 401) store.delete("opencrate_spotify_access");
      const message = response.status === 403
        ? "Spotify only allows imports for playlists you own or collaborate on."
        : data.error?.message || "Spotify import failed.";
      return Response.json({ error: message, needsAuth: response.status === 401 }, { status: response.status });
    }
    tracks.push(...mapSpotifyItems(data.items || []));
    nextUrl = data.next || null;
  }

  return Response.json({ playlistId: id, tracks: tracks.slice(0, 100) });
}
