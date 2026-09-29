import type { TestContext } from "node:test";

type Env = Record<string, string | undefined>;

/** Set environment variables for one test and restore them afterwards. */
export function withEnv(t: TestContext, env: Env) {
  const previous: Env = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

/** Route mocked fetch calls by hostname and record every requested URL. */
export function mockFetch(t: TestContext, handlers: Record<string, Handler>) {
  const calls: URL[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push(url);
    const handler = handlers[url.hostname];
    if (!handler) throw new Error(`Unexpected fetch to ${url.hostname}`);
    return handler(url, init);
  });
  return calls;
}

export const jamendoTrack = {
  id: "123",
  name: "Nightfall",
  artist_name: "June",
  audiodownload_allowed: true,
  audiodownload: "https://example.com/audio.mp3",
};

/** A TypeSafe System One response with one Score answer per candidate. */
export function jevScores(scores: number[]) {
  return Response.json({
    model: "jev-test",
    answers: Object.fromEntries(scores.map((score, index) => [`candidate_${index}`, {
      type: "score",
      score,
      confidence: 0.9,
      legend: { 0: "different", 1: "version", 2: "same" },
      probabilities: { 0: 0, 1: 0, 2: 1 },
    }])),
    usage: { input_tokens: 400, output_tokens: 10 },
  });
}
