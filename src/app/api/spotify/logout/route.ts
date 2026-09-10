import { cookies } from "next/headers";

export async function POST() {
  const store = await cookies();
  store.delete("opencrate_spotify_access");
  return Response.json({ ok: true });
}
