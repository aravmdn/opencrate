import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";

export async function GET(request: Request) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json({ error: "Spotify OAuth is not configured." }, { status: 503 });
  }

  const origin = new URL(request.url).origin;
  const state = randomBytes(24).toString("base64url");
  const store = await cookies();
  store.set("opencrate_spotify_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${origin}/api/spotify/callback`,
    state,
    scope: "playlist-read-private",
    show_dialog: "true",
  });
  return Response.redirect(`${AUTHORIZE_URL}?${params}`, 307);
}

