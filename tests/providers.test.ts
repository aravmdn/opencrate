import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateQuery, mapJamendoTrack, searchCatalog } from "../src/lib/jamendo";
import { findCatalogMatch } from "../src/lib/matching";
import { fetchSpotifyPlaylist, mapSpotifyItems, parseSpotifyPlaylistId, SpotifyImportError } from "../src/lib/spotify";
import { GET as download } from "../src/app/api/catalog/download/route";
import { POST as match } from "../src/app/api/catalog/match/route";
import { jamendoTrack as track, mockFetch, withEnv } from "./helpers";

const spotifyTrack = { id: "1234567890abcdefgh1234", name: "Nightfall", type: "track", artists: [{ name: "June" }] };

test("Spotify URL parser rejects unrelated hosts and non-playlist paths", () => {
  assert.equal(parseSpotifyPlaylistId(`https://open.spotify.com/playlist/${spotifyTrack.id}?si=test`), spotifyTrack.id);
  assert.equal(parseSpotifyPlaylistId(`spotify:playlist:${spotifyTrack.id}`), spotifyTrack.id);
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
  const calls = mockFetch(t, {
    "api.spotify.com": () => Response.json({ items: Array.from({ length: 50 }, () => ({ item: spotifyTrack })), next: "https://untrusted.example/page" }),
  });
  const result = await fetchSpotifyPlaylist(spotifyTrack.id, "test-token");
  assert.equal(result.tracks.length, 100);
  assert.equal(result.truncated, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].searchParams.get("offset"), "50");
  assert.ok(calls.every((url) => url.origin === "https://api.spotify.com"));
});

test("Spotify pagination stops after 100 entries even when none are playable", async (t) => {
  const calls = mockFetch(t, { "api.spotify.com": () => Response.json({ items: [{ item: null }], next: "https://api.spotify.com/next" }) });
  assert.equal((await fetchSpotifyPlaylist(spotifyTrack.id, "test-token")).tracks.length, 0);
  assert.equal(calls.length, 2);
});

test("Spotify access denial is reported as a reconnect or permission error", async (t) => {
  mockFetch(t, { "api.spotify.com": () => new Response(null, { status: 403 }) });
  await assert.rejects(fetchSpotifyPlaylist(spotifyTrack.id, "test-token"), (error: unknown) =>
    error instanceof SpotifyImportError && error.status === 403 && error.message.includes("collaborate"));
});

test("downloads require explicit permission and a supplied file", () => {
  assert.equal(mapJamendoTrack(track).downloadAllowed, true);
  assert.equal(mapJamendoTrack({ ...track, audiodownload_allowed: false }).downloadAllowed, false);
  assert.equal(mapJamendoTrack({ ...track, audiodownload: "" }).downloadAllowed, false);
  assert.equal(mapJamendoTrack({ ...track, audiodownload_allowed: undefined }).downloadAllowed, false);
});

test("catalog requests include singles as well as album tracks", async (t) => {
  withEnv(t, { JAMENDO_CLIENT_ID: "test-client" });
  const calls = mockFetch(t, { "api.jamendo.com": () => Response.json({ results: [] }) });
  await searchCatalog("nightfall");
  assert.equal(calls[0].searchParams.get("type"), "single albumtrack");
});

test("candidate queries drop credits and edition suffixes but keep the primary artist", () => {
  assert.equal(candidateQuery("Hello (feat. Kim)", "DJ Nova, Kim"), "Hello DJ Nova");
  assert.equal(candidateQuery("Soft Focus - Remastered 2019", "June Street"), "Soft Focus June Street");
  assert.equal(candidateQuery("(Intro)", "June"), "(Intro) June");
});

test("exact matching rejects substring artists and distinguishes non-Latin titles", async (t) => {
  withEnv(t, { JAMENDO_CLIENT_ID: "test-client", TYPESAFE_API_KEY: undefined });
  let providerTrack = { ...track, artist_name: "June Tribute" };
  mockFetch(t, { "api.jamendo.com": () => Response.json({ results: [providerTrack] }) });
  assert.equal((await findCatalogMatch({ title: "Nightfall", artist: "June" })).match, null);
  providerTrack = { ...track, name: "夜", artist_name: "月" };
  const found = await findCatalogMatch({ title: "夜", artist: "月" });
  assert.equal(found.match?.id, "123");
  assert.equal(found.method, "exact");
  assert.equal((await findCatalogMatch({ title: "星", artist: "月" })).match, null);
});

test("download endpoint rechecks current permission before redirecting", async (t) => {
  withEnv(t, { JAMENDO_CLIENT_ID: "test-client" });
  let allowed = false;
  mockFetch(t, { "api.jamendo.com": () => Response.json({ results: [{ ...track, audiodownload_allowed: allowed }] }) });
  const request = new Request("http://localhost/api/catalog/download?id=123");
  assert.equal((await download(request)).status, 404);
  allowed = true;
  const response = await download(request);
  assert.equal(response.status, 307);
  const destination = new URL(response.headers.get("location")!);
  assert.equal(destination.origin, "https://api.jamendo.com");
  assert.equal(destination.searchParams.get("audioformat"), "mp32");
});

test("download endpoint reports a missing catalog key as unavailable, not as a provider error", async (t) => {
  withEnv(t, { JAMENDO_CLIENT_ID: undefined });
  const response = await download(new Request("http://localhost/api/catalog/download?id=123"));
  assert.equal(response.status, 503);
});

test("matching rejects null JSON and oversized batches instead of silently dropping tracks", async () => {
  for (const body of [null, { tracks: Array.from({ length: 51 }, () => ({ title: "Nightfall", artist: "June" })) }]) {
    const response = await match(new Request("http://localhost/api/catalog/match", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    assert.equal(response.status, 400);
  }
});

test("matching rebuilds tracks from known fields instead of echoing client data", async (t) => {
  withEnv(t, { JAMENDO_CLIENT_ID: "test-client", TYPESAFE_API_KEY: undefined });
  mockFetch(t, { "api.jamendo.com": () => Response.json({ results: [] }) });
  const response = await match(new Request("http://localhost/api/catalog/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tracks: [{ title: " Nightfall ", artist: "June", injected: "<script>", spotifyUrl: "javascript:alert(1)" }] }),
  }));
  const data = await response.json() as { matches: Array<{ source: Record<string, unknown> }> };
  assert.equal(response.status, 200);
  assert.equal(data.matches[0].source.title, "Nightfall");
  assert.equal(data.matches[0].source.spotifyUrl, "");
  assert.equal("injected" in data.matches[0].source, false);
});
