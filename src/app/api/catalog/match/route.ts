import { findCatalogMatch } from "@/lib/jamendo";
import type { PlaylistTrack, TrackMatch } from "@/lib/types";

const MAX_TRACKS = 50;

export async function POST(request: Request) {
  let body: { tracks?: PlaylistTrack[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const tracks = Array.isArray(body.tracks)
    ? body.tracks.filter((track): track is PlaylistTrack =>
      typeof track?.title === "string" && typeof track?.artist === "string" &&
      track.title.trim().length > 0 && track.artist.trim().length > 0,
    ).slice(0, MAX_TRACKS).map((track) => ({
      ...track,
      title: track.title.trim().slice(0, 160),
      artist: track.artist.trim().slice(0, 160),
    }))
    : [];
  if (!tracks.length) return Response.json({ error: "No tracks supplied." }, { status: 400 });

  try {
    const matches: TrackMatch[] = [];
    for (let index = 0; index < tracks.length; index += 5) {
      const batch = tracks.slice(index, index + 5);
      matches.push(...await Promise.all(batch.map(async (source) => ({
        source,
        match: await findCatalogMatch(source.title, source.artist),
      }))));
    }
    return Response.json({ matches });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Matching failed." },
      { status: error instanceof Error && error.message.includes("not configured") ? 503 : 502 },
    );
  }
}
