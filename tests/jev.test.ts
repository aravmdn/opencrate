import assert from "node:assert/strict";
import { test } from "node:test";
import { GET as search } from "../src/app/api/catalog/search/route";
import { interpretQuery } from "../src/lib/jev";
import { chooseMatch, findCatalogMatch } from "../src/lib/matching";
import { parseTrackList } from "../src/lib/track-list";
import { mapJamendoTrack } from "../src/lib/jamendo";
import { jamendoTrack, jevScores, mockFetch, withEnv } from "./helpers";

const JEV_ENV = { JAMENDO_CLIENT_ID: "test-client", TYPESAFE_API_KEY: "test-key" };
const remaster = { ...jamendoTrack, id: "200", name: "Nightfall (Remastered)" };
const remix = { ...jamendoTrack, id: "300", name: "Nightfall (Lumen Remix)" };

function choiceAnswer(choice: string, confidence: number) {
  return { type: "choice", choice, confidence, probabilities: { [choice]: confidence } };
}

function vibeAnswers(answers: Record<string, [string, number]>) {
  return Response.json({
    model: "jev-test",
    answers: Object.fromEntries(Object.entries(answers).map(([key, [choice, confidence]]) => [key, choiceAnswer(choice, confidence)])),
    usage: { input_tokens: 300, output_tokens: 10 },
  });
}

test("an exact match is accepted without asking Jev", async (t) => {
  withEnv(t, JEV_ENV);
  const calls = mockFetch(t, { "api.jamendo.com": () => Response.json({ results: [jamendoTrack] }) });
  const result = await findCatalogMatch({ title: "Nightfall", artist: "June" });
  assert.equal(result.method, "exact");
  assert.ok(calls.every((url) => url.hostname !== "api.typesafe.ai"));
});

test("Jev accepts a same-recording judgment and sends only downloadable candidates", async (t) => {
  withEnv(t, JEV_ENV);
  let questionCount = 0;
  mockFetch(t, {
    "api.jamendo.com": () => Response.json({ results: [remaster, { ...remix, audiodownload_allowed: false }] }),
    "api.typesafe.ai": async (_url, init) => {
      questionCount = Object.keys(JSON.parse(String(init?.body)).questions).length;
      return jevScores([1.9]);
    },
  });
  const result = await findCatalogMatch({ title: "Nightfall", artist: "June" });
  assert.equal(questionCount, 1);
  assert.equal(result.match?.id, "200");
  assert.equal(result.method, "jev");
  assert.equal(result.confidence, 0.9);
});

test("Jev offers a remix as an alternate, never as a match", async (t) => {
  withEnv(t, JEV_ENV);
  mockFetch(t, {
    "api.jamendo.com": () => Response.json({ results: [remix] }),
    "api.typesafe.ai": () => jevScores([1.1]),
  });
  const result = await findCatalogMatch({ title: "Nightfall", artist: "June" });
  assert.equal(result.match, null);
  assert.equal(result.alternate?.id, "300");
});

test("a Jev outage falls back to exact matching instead of failing the import", async (t) => {
  withEnv(t, JEV_ENV);
  t.mock.method(console, "warn", () => undefined);
  mockFetch(t, {
    "api.jamendo.com": () => Response.json({ results: [remaster] }),
    "api.typesafe.ai": () => Response.json({ error: "unauthorized" }, { status: 401 }),
  });
  assert.deepEqual(await findCatalogMatch({ title: "Nightfall", artist: "June" }), { match: null });
});

test("the strongest same-recording judgment wins", () => {
  const judge = (id: string, relation: "same" | "version" | "different", score: number) =>
    ({ track: mapJamendoTrack({ ...jamendoTrack, id }), relation, score, confidence: 0.8 });
  const result = chooseMatch([judge("a", "version", 1.2), judge("b", "same", 1.6), judge("c", "same", 1.95), judge("d", "different", 0.1)]);
  assert.equal(result.match?.id, "c");
  assert.equal(chooseMatch([judge("d", "different", 0.1)]).alternate, null);
});

test("a vibe query becomes catalog tags and filters", async (t) => {
  withEnv(t, JEV_ENV);
  mockFetch(t, {
    "api.typesafe.ai": () => vibeAnswers({
      intent: ["vibe", 1], genre: ["classical", 0.84], mood: ["relaxing", 1], speed: ["low", 0.9], vocals: ["instrumental", 0.95],
    }),
  });
  assert.deepEqual(await interpretQuery("calm piano to study to"), { tags: ["classical", "relaxing"], speed: "low", vocals: "instrumental" });
});

test("named queries and unsure readings stay plain text searches", async (t) => {
  withEnv(t, JEV_ENV);
  let answers: Record<string, [string, number]> = {
    intent: ["named", 1], genre: ["rock", 1], mood: ["epic", 0.97], speed: ["any", 0.98], vocals: ["vocal", 0.78],
  };
  mockFetch(t, { "api.typesafe.ai": () => vibeAnswers(answers) });
  assert.equal(await interpretQuery("Bohemian Rhapsody"), null);
  answers = { intent: ["vibe", 0.99], genre: ["lounge", 0.24], mood: ["dark", 0.31], speed: ["any", 0.72], vocals: ["any", 0.99] };
  assert.equal(await interpretQuery("late night"), null);
});

test("search uses Jev's filters and falls back to text when they find nothing", async (t) => {
  withEnv(t, JEV_ENV);
  let vibeResults = [jamendoTrack];
  const calls = mockFetch(t, {
    "api.typesafe.ai": () => vibeAnswers({ intent: ["vibe", 1], genre: ["jazz", 0.99], mood: ["relaxing", 0.99], speed: ["any", 0.6], vocals: ["any", 0.5] }),
    "api.jamendo.com": (url) => Response.json({ results: url.searchParams.has("fuzzytags") ? vibeResults : [remix] }),
  });

  let data = await (await search(new Request("http://localhost/api/catalog/search?q=rainy+day+jazz"))).json();
  assert.deepEqual(data.vibe, { tags: ["jazz", "relaxing"] });
  assert.equal(calls.find((url) => url.hostname === "api.jamendo.com")?.searchParams.get("fuzzytags"), "jazz relaxing");

  vibeResults = [];
  data = await (await search(new Request("http://localhost/api/catalog/search?q=rainy+day+jazz"))).json();
  assert.equal(data.vibe, undefined);
  assert.equal(data.tracks[0].id, "300");
});

test("mode=text searches the exact words without asking Jev", async (t) => {
  withEnv(t, JEV_ENV);
  const calls = mockFetch(t, { "api.jamendo.com": () => Response.json({ results: [jamendoTrack] }) });
  const response = await search(new Request("http://localhost/api/catalog/search?q=rainy+day+jazz&mode=text"));
  assert.equal(response.status, 200);
  assert.ok(calls.every((url) => url.hostname === "api.jamendo.com"));
  assert.equal(calls[0].searchParams.get("search"), "rainy day jazz");
});

test("pasted lists accept dashes and numbering and report skipped lines", () => {
  const { tracks, skipped, truncated } = parseTrackList("1. Midnight Drive — The Satellites\n02) Soft Focus - June Street\n\njust a title\nRêverie – Élodie - Live");
  assert.deepEqual(tracks.map(({ title, artist }) => [title, artist]), [
    ["Midnight Drive", "The Satellites"], ["Soft Focus", "June Street"], ["Rêverie", "Élodie - Live"],
  ]);
  assert.equal(skipped, 1);
  assert.equal(truncated, false);
  assert.equal(parseTrackList(Array.from({ length: 101 }, (_, i) => `Song ${i} - Artist`).join("\n")).truncated, true);
});
