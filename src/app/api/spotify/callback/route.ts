import { cookies } from "next/headers";

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const store = await cookies();
  const expectedState = store.get("opencrate_spotify_state")?.value;
  store.delete("opencrate_spotify_state");

  if (error) return Response.redirect(`${origin}/?spotify=denied`, 303);
  if (!code || !state || !expectedState || state !== expectedState) {
    return Response.redirect(`${origin}/?spotify=invalid_state`, 303);
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return Response.redirect(`${origin}/?spotify=not_configured`, 303);

  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/api/spotify/callback`,
    }),
    cache: "no-store",
  });

  const tokens = (await tokenResponse.json()) as TokenResponse;
  if (!tokenResponse.ok || !tokens.access_token) {
    return Response.redirect(`${origin}/?spotify=token_error`, 303);
  }

  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: origin.startsWith("https://"),
    path: "/",
  };
  store.set("opencrate_spotify_access", tokens.access_token, {
    ...cookieOptions,
    maxAge: Math.max((tokens.expires_in || 3600) - 60, 60),
  });
  return Response.redirect(`${origin}/?spotify=connected`, 303);
}
