import type { CatalogTrack } from "@/lib/types";

const API_ROOT = "https://api.jamendo.com/v3.0";

type JamendoTrack = {
  id: string;
  name: string;
  artist_name: string;
  album_name?: string;
  image?: string;
  album_image?: string;
  duration?: number;
  audio?: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean;
  license_ccurl?: string;
  shareurl?: string;
};

type JamendoResponse = {
  headers?: { status?: string; error_message?: string };
  results?: JamendoTrack[];
};

function clientId(): string {
  const value = process.env.JAMENDO_CLIENT_ID;
  if (!value) throw new Error("JAMENDO_CLIENT_ID is not configured.");
  return value;
}

export function mapJamendoTrack(track: JamendoTrack): CatalogTrack {
  return {
    id: track.id,
    title: track.name,
    artist: track.artist_name,
    album: track.album_name || "Single",
    artwork: track.image || track.album_image || "",
    duration: track.duration || 0,
    streamUrl: track.audio || "",
    downloadAllowed: track.audiodownload_allowed === true && Boolean(track.audiodownload),
    licenseUrl: track.license_ccurl || "",
    sourceUrl: track.shareurl || "https://www.jamendo.com",
  };
}

async function request(params: URLSearchParams): Promise<CatalogTrack[]> {
  params.set("client_id", clientId());
  params.set("format", "json");
  params.set("include", "licenses");
  params.set("audioformat", "mp31");
  params.set("audiodlformat", "mp32");
  params.set("type", "all");

  const response = await fetch(`${API_ROOT}/tracks/?${params}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) throw new Error(`Jamendo returned ${response.status}.`);
  const data = (await response.json()) as JamendoResponse;
  if (data.headers?.status === "failed") {
    throw new Error(data.headers.error_message || "Jamendo request failed.");
  }

  return (data.results || []).map(mapJamendoTrack);
}

export async function searchCatalog(query: string, limit = 20): Promise<CatalogTrack[]> {
  const params = new URLSearchParams({
    search: query,
    limit: String(Math.min(Math.max(limit, 1), 50)),
    order: "relevance",
  });
  return request(params);
}

export async function findCatalogMatch(title: string, artist: string): Promise<CatalogTrack | null> {
  const query = `${title} ${artist}`.trim();
  const tracks = await searchCatalog(query, 5);
  const downloadable = tracks.filter((track) => track.downloadAllowed);
  if (!downloadable.length) return null;

  const normalizedTitle = normalize(title);
  const normalizedArtist = normalize(artist.split(",")[0]);
  return downloadable.find((track) =>
    normalizedTitle && normalizedArtist &&
    normalize(track.title) === normalizedTitle && normalize(track.artist) === normalizedArtist,
  ) || null;
}

export async function getDownloadableTrack(id: string): Promise<CatalogTrack | null> {
  const params = new URLSearchParams({ id, limit: "1" });
  const [track] = await request(params);
  return track?.downloadAllowed ? track : null;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
