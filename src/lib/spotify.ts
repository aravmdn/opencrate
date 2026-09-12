import type { PlaylistTrack } from "@/lib/types";

const SPOTIFY_HOSTS = new Set(["open.spotify.com", "www.open.spotify.com"]);

export function parseSpotifyPlaylistId(value: string): string | null {
  const trimmed = value.trim();

  if (/^[A-Za-z0-9]{10,32}$/.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("spotify:playlist:")) {
    const id = trimmed.split(":")[2];
    return /^[A-Za-z0-9]{10,32}$/.test(id ?? "") ? id : null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || !SPOTIFY_HOSTS.has(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const playlistIndex = parts.indexOf("playlist");
    if (playlistIndex < 0) return null;
    const id = parts[playlistIndex + 1];
    return /^[A-Za-z0-9]{10,32}$/.test(id ?? "") ? id : null;
  } catch {
    return null;
  }
}

type SpotifyTrack = {
    id?: string;
    name?: string;
    type?: string;
    external_urls?: { spotify?: string };
    artists?: Array<{ name?: string }>;
    album?: { name?: string; images?: Array<{ url?: string }> };
};

type SpotifyItem = {
  item?: SpotifyTrack | null;
  track?: SpotifyTrack | null;
  is_local?: boolean;
};

export function mapSpotifyItems(items: SpotifyItem[]): PlaylistTrack[] {
  return items.flatMap((entry) => {
    if (entry.is_local) return [];
    const track = entry.item === undefined ? entry.track : entry.item;
    if (!track || track.type !== "track" || !track.id || !track.name) return [];

    return [{
      id: track.id,
      title: track.name,
      artist: track.artists?.map((artist) => artist.name).filter(Boolean).join(", ") || "Unknown artist",
      album: track.album?.name || "Unknown album",
      artwork: track.album?.images?.[0]?.url || "",
      spotifyUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
    }];
  });
}

export class SpotifyImportError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function fetchSpotifyPlaylist(id: string, token: string) {
  const tracks: PlaylistTrack[] = [];
  let truncated = false;
  // Bound work by playlist entries, including unavailable tracks and episodes.
  // Construct every page URL locally rather than following a remote next URL.
  for (let offset = 0; offset < 100; offset += 50) {
    const url = `https://api.spotify.com/v1/playlists/${id}/items?limit=50&offset=${offset}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      const message = response.status === 403
        ? "Spotify only allows imports for playlists you own or collaborate on."
        : response.status === 401 ? "Your Spotify session expired. Please reconnect."
        : response.status === 429 ? "Spotify is rate limiting requests. Please try again later."
        : "Spotify could not read this playlist.";
      throw new SpotifyImportError(message, response.status);
    }
    const data = await response.json() as { items?: SpotifyItem[]; next?: string | null };
    tracks.push(...mapSpotifyItems(data.items || []));
    truncated = Boolean(data.next);
    if (!truncated) break;
  }
  return { playlistId: id, tracks: tracks.slice(0, 100), truncated };
}
