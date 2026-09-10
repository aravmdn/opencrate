import { searchCatalog } from "@/lib/jamendo";

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q")?.trim() || "").slice(0, 120);
  if (query.length < 2) {
    return Response.json({ error: "Enter at least two characters." }, { status: 400 });
  }

  try {
    return Response.json({ tracks: await searchCatalog(query) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Catalog search failed." },
      { status: error instanceof Error && error.message.includes("not configured") ? 503 : 502 },
    );
  }
}
