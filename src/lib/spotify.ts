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
    if (!SPOTIFY_HOSTS.has(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const playlistIndex = parts.indexOf("playlist");
    const id = parts[playlistIndex + 1];
    return /^[A-Za-z0-9]{10,32}$/.test(id ?? "") ? id : null;
  } catch {
    return null;
  }
}

type SpotifyItem = {
  track?: {
    id?: string;
    name?: string;
    type?: string;
    external_urls?: { spotify?: string };
    artists?: Array<{ name?: string }>;
    album?: { name?: string; images?: Array<{ url?: string }> };
  } | null;
};

export function mapSpotifyItems(items: SpotifyItem[]): PlaylistTrack[] {
  return items.flatMap(({ track }) => {
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

