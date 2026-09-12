import { cookies } from "next/headers";
import { fetchSpotifyPlaylist, parseSpotifyPlaylistId, SpotifyImportError } from "@/lib/spotify";

export async function GET(request: Request) {
  const playlistUrl = new URL(request.url).searchParams.get("url") || "";
  const id = parseSpotifyPlaylistId(playlistUrl);
  if (!id) return Response.json({ error: "Paste a valid Spotify playlist URL." }, { status: 400 });

  const store = await cookies();
  const token = store.get("opencrate_spotify_access")?.value;
  if (!token) {
    return Response.json({ error: "Connect Spotify before importing.", needsAuth: true }, { status: 401 });
  }

  try {
    return Response.json(await fetchSpotifyPlaylist(id, token));
  } catch (error) {
    const status = error instanceof SpotifyImportError ? error.status : 502;
    if (status === 401) store.delete("opencrate_spotify_access");
    return Response.json({
      error: error instanceof SpotifyImportError ? error.message : "Spotify is unavailable. Please try again.",
      needsAuth: status === 401,
    }, { status });
  }
}
