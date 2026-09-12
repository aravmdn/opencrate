import assert from "node:assert/strict";
import { test } from "node:test";
import { findCatalogMatch, mapJamendoTrack } from "../src/lib/jamendo";
import { fetchSpotifyPlaylist, mapSpotifyItems, parseSpotifyPlaylistId, SpotifyImportError } from "../src/lib/spotify";
import { GET as download } from "../src/app/api/catalog/download/route";
import { POST as match } from "../src/app/api/catalog/match/route";

const track = { id: "123", name: "Nightfall", artist_name: "June", audiodownload_allowed: true, audiodownload: "https://example.com/audio.mp3" };
const spotifyTrack = { id: "1234567890abcdefgh1234", name: "Nightfall", type: "track", artists: [{ name: "June" }] };

test("Spotify URL parser rejects unrelated hosts and non-playlist paths", () => {
  assert.equal(parseSpotifyPlaylistId(`https://open.spotify.com/playlist/${spotifyTrack.id}?si=test`), spotifyTrack.id);
  assert.equal(parseSpotifyPlaylistId(`https://open.spotify.com/${spotifyTrack.id}`), null);
  assert.equal(parseSpotifyPlaylistId(`https://evil.example/playlist/${spotifyTrack.id}`), null);
  assert.equal(parseSpotifyPlaylistId(`ftp://open.spotify.com/playlist/${spotifyTrack.id}`), null);
});

test("Spotify mapping supports current and legacy fields, excluding episodes and local files", () => {
  const mapped = mapSpotifyItems([
    { item: spotifyTrack }, { track: spotifyTrack }, { item: null },
    { item: { ...spotifyTrack, type: "episode" } },
    { item: spotifyTrack, is_local: true },
  ]);
  assert.equal(mapped.length, 2);
  assert.equal(mapped[0].artist, "June");
  assert.equal(mapped[0].spotifyUrl, `https://open.spotify.com/track/${spotifyTrack.id}`);
});

test("Spotify pagination preserves 100 tracks and reports the import cap", async (t) => {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    urls.push(url);
    return Response.json({ items: Array.from({ length: 50 }, () => ({ item: spotifyTrack })), next: "https://untrusted.example/page" });
  });
  const result = await fetchSpotifyPlaylist(spotifyTrack.id, "test-token");
  assert.equal(result.tracks.length, 100);
  assert.equal(result.truncated, true);
  assert.equal(urls.length, 2);
  assert.ok(urls[1].endsWith("offset=50"));
  assert.ok(urls.every((url) => new URL(url).origin === "https://api.spotify.com"));
});

test("Spotify pagination stops after 100 entries even when none are playable", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ items: [{ item: null }], next: "https://api.spotify.com/next" });
  });
  assert.equal((await fetchSpotifyPlaylist(spotifyTrack.id, "test-token")).tracks.length, 0);
  assert.equal(calls, 2);
});

test("Spotify access denial is reported as a reconnect or permission error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 403 }));
  await assert.rejects(fetchSpotifyPlaylist(spotifyTrack.id, "test-token"), (error: unknown) =>
    error instanceof SpotifyImportError && error.status === 403 && error.message.includes("collaborate"));
});

test("downloads require explicit permission and a supplied file", () => {
  assert.equal(mapJamendoTrack(track).downloadAllowed, true);
  assert.equal(mapJamendoTrack({ ...track, audiodownload_allowed: false }).downloadAllowed, false);
  assert.equal(mapJamendoTrack({ ...track, audiodownload: "" }).downloadAllowed, false);
  assert.equal(mapJamendoTrack({ ...track, audiodownload_allowed: undefined }).downloadAllowed, false);
});

test("matching rejects substring artists and distinguishes non-Latin titles", async (t) => {
  const previous = process.env.JAMENDO_CLIENT_ID;
  process.env.JAMENDO_CLIENT_ID = "test-client";
  t.after(() => { if (previous === undefined) delete process.env.JAMENDO_CLIENT_ID; else process.env.JAMENDO_CLIENT_ID = previous; });
  let providerTrack = { ...track, artist_name: "June Tribute" };
  t.mock.method(globalThis, "fetch", async () => Response.json({ results: [providerTrack] }));
  assert.equal(await findCatalogMatch("Nightfall", "June"), null);
  providerTrack = { ...track, name: "夜", artist_name: "月" };
  assert.equal((await findCatalogMatch("夜", "月"))?.id, "123");
  assert.equal(await findCatalogMatch("星", "月"), null);
});

test("download endpoint rechecks current permission before redirecting", async (t) => {
  const previous = process.env.JAMENDO_CLIENT_ID;
  process.env.JAMENDO_CLIENT_ID = "test-client";
  t.after(() => { if (previous === undefined) delete process.env.JAMENDO_CLIENT_ID; else process.env.JAMENDO_CLIENT_ID = previous; });
  let allowed = false;
  t.mock.method(globalThis, "fetch", async () => Response.json({ results: [{ ...track, audiodownload_allowed: allowed }] }));
  const request = new Request("http://localhost/api/catalog/download?id=123");
  assert.equal((await download(request)).status, 404);
  allowed = true;
  const response = await download(request);
  assert.equal(response.status, 307);
  const destination = new URL(response.headers.get("location")!);
  assert.equal(destination.origin, "https://api.jamendo.com");
  assert.equal(destination.searchParams.get("audioformat"), "mp32");
});

test("matching rejects null JSON and oversized batches instead of silently dropping tracks", async () => {
  for (const body of [null, { tracks: Array.from({ length: 51 }, () => ({ title: "Nightfall", artist: "June" })) }]) {
    const response = await match(new Request("http://localhost/api/catalog/match", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    assert.equal(response.status, 400);
  }
});
