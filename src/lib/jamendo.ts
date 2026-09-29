import type { CatalogTrack, VibeFilters } from "@/lib/types";

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

/** Thrown when the server has no Jamendo client ID, so routes can answer 503 instead of 502. */
export class CatalogNotConfiguredError extends Error {
  constructor() {
    super("JAMENDO_CLIENT_ID is not configured.");
  }
}

export function catalogConfigured(): boolean {
  return Boolean(process.env.JAMENDO_CLIENT_ID);
}

export function jamendoClientId(): string {
  const value = process.env.JAMENDO_CLIENT_ID;
  if (!value) throw new CatalogNotConfiguredError();
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
  params.set("client_id", jamendoClientId());
  params.set("format", "json");
  params.set("include", "licenses");
  params.set("audioformat", "mp31");
  params.set("audiodlformat", "mp32");
  // Jamendo returns only album tracks unless both types are requested.
  params.set("type", "single albumtrack");

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

function clampLimit(limit: number): string {
  return String(Math.min(Math.max(limit, 1), 50));
}

export async function searchCatalog(query: string, limit = 20): Promise<CatalogTrack[]> {
  return request(new URLSearchParams({ search: query, limit: clampLimit(limit), order: "relevance" }));
}

/** Search by tags and musical attributes instead of free text. */
export async function searchByVibe(filters: VibeFilters, limit = 20): Promise<CatalogTrack[]> {
  const params = new URLSearchParams({ fuzzytags: filters.tags.join(" "), limit: clampLimit(limit) });
  if (filters.speed) params.set("speed", filters.speed);
  if (filters.vocals) params.set("vocalinstrumental", filters.vocals);
  return request(params);
}

export async function getDownloadableTrack(id: string): Promise<CatalogTrack | null> {
  const [track] = await request(new URLSearchParams({ id, limit: "1" }));
  return track?.downloadAllowed ? track : null;
}

export function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function primaryArtist(artist: string): string {
  return artist.split(",")[0].trim();
}

/** Identical normalized title and primary artist. */
export function isExactMatch(track: Pick<CatalogTrack, "title" | "artist">, title: string, artist: string): boolean {
  const wantedTitle = normalize(title);
  const wantedArtist = normalize(primaryArtist(artist));
  return Boolean(wantedTitle && wantedArtist) &&
    normalize(track.title) === wantedTitle && normalize(track.artist) === wantedArtist;
}

/**
 * Build a catalog query that finds versions of a song. Bracketed credits and
 * " - Remastered"-style suffixes are dropped so they do not hide candidates;
 * deciding whether a candidate is the same recording happens later.
 */
export function candidateQuery(title: string, artist: string): string {
  const baseTitle = title.replace(/\s*[([][^)\]]*[)\]]/g, " ").replace(/\s+-\s+.*$/, "").trim() || title;
  return `${baseTitle} ${primaryArtist(artist)}`.replace(/\s+/g, " ").trim();
}
