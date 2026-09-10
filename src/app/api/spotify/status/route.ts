import { cookies } from "next/headers";

export async function GET() {
  const store = await cookies();
  return Response.json({
    configured: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
    connected: Boolean(store.get("opencrate_spotify_access")?.value),
  });
}

