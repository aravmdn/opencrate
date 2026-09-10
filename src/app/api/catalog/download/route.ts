import { getDownloadableTrack } from "@/lib/jamendo";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^\d{1,20}$/.test(id)) return Response.json({ error: "Invalid track id." }, { status: 400 });

  try {
    const track = await getDownloadableTrack(id);
    if (!track) return Response.json({ error: "This artist has not enabled downloads." }, { status: 404 });

    const clientId = process.env.JAMENDO_CLIENT_ID;
    const url = new URL("https://api.jamendo.com/v3.0/tracks/file/");
    url.searchParams.set("client_id", clientId!);
    url.searchParams.set("id", id);
    url.searchParams.set("audioformat", "mp32");
    url.searchParams.set("action", "download");
    return Response.redirect(url, 307);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Download lookup failed." },
      { status: 502 },
    );
  }
}
