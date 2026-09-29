import { CatalogNotConfiguredError } from "@/lib/jamendo";
import { findCatalogMatch } from "@/lib/matching";
import type { PlaylistTrack, TrackMatch } from "@/lib/types";

const MAX_TRACKS = 50;
const CONCURRENCY = 5;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Rebuild each track from known fields so arbitrary client data is never echoed back.
function sanitize(input: unknown): PlaylistTrack | null {
  if (!input || typeof input !== "object") return null;
  const track = input as Record<string, unknown>;
  const title = text(track.title, 160);
  const artist = text(track.artist, 160);
  if (!title || !artist) return null;
  const spotifyUrl = text(track.spotifyUrl, 200);
  const artwork = text(track.artwork, 500);
  return {
    id: text(track.id, 64) || `${title}-${artist}`,
    title,
    artist,
    album: text(track.album, 160),
    artwork: artwork.startsWith("https://") ? artwork : "",
    spotifyUrl: spotifyUrl.startsWith("https://open.spotify.com/") ? spotifyUrl : "",
  };
}

export async function POST(request: Request) {
  let body: { tracks?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || !Array.isArray(body.tracks) || body.tracks.length > MAX_TRACKS) {
    return Response.json({ error: `Supply between 1 and ${MAX_TRACKS} tracks per request.` }, { status: 400 });
  }

  const tracks = body.tracks.map(sanitize).filter((track) => track !== null);
  if (!tracks.length) return Response.json({ error: "No tracks supplied." }, { status: 400 });

  try {
    const matches: TrackMatch[] = [];
    for (let index = 0; index < tracks.length; index += CONCURRENCY) {
      const batch = tracks.slice(index, index + CONCURRENCY);
      matches.push(...await Promise.all(batch.map(async (source) => ({ source, ...await findCatalogMatch(source) }))));
    }
    return Response.json({ matches });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Matching failed." },
      { status: error instanceof CatalogNotConfiguredError ? 503 : 502 },
    );
  }
}
