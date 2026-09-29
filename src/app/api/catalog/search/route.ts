import { CatalogNotConfiguredError, catalogConfigured, searchByVibe, searchCatalog } from "@/lib/jamendo";
import { interpretQuery, jevConfigured } from "@/lib/jev";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q")?.trim() || "").slice(0, 120);
  if (query.length < 2) {
    return Response.json({ error: "Enter at least two characters." }, { status: 400 });
  }

  // mode=text skips interpretation, so listeners can always search the exact words.
  if (params.get("mode") !== "text" && catalogConfigured() && jevConfigured()) {
    try {
      const vibe = await interpretQuery(query);
      if (vibe) {
        const tracks = await searchByVibe(vibe);
        if (tracks.length) return Response.json({ tracks, vibe });
      }
    } catch (error) {
      console.warn("[opencrate] Vibe search failed; falling back to text search.", error);
    }
  }

  try {
    return Response.json({ tracks: await searchCatalog(query) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Catalog search failed." },
      { status: error instanceof CatalogNotConfiguredError ? 503 : 502 },
    );
  }
}
