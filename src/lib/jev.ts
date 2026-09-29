import { choice, score, type ScoreQuestion, TypeSafeClient } from "@typesafe-ai/sdk";
import type { CatalogTrack, PlaylistTrack, VibeFilters } from "@/lib/types";

// Jev is TypeSafe's System One model: it answers typed questions with calibrated
// probabilities. OpenCrate asks it narrow judgments and keeps every policy
// decision (download permission, thresholds, fallbacks) in code.
// https://docs.typesafe.ai

let client: TypeSafeClient | undefined;

export function jevConfigured(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY);
}

function jev(): TypeSafeClient {
  client ??= new TypeSafeClient({
    timeout: 8_000,
    retry: { maxRetries: 1 },
    logLevel: "error",
    // Look up fetch on every call rather than capturing it once.
    fetch: (input, init) => fetch(input, init),
  });
  return client;
}

// ---------------------------------------------------------------------------
// Playlist matching: is this catalog track the recording the listener wants?
// ---------------------------------------------------------------------------

// Each level is one outcome, so the decision is "nearest level" with no fitted threshold.
const RELATION_LEVELS = [
  "A different song. The titles name different works, or the catalog track is by a different, unrelated artist.",
  "The same song in a different version: a remix, live recording, acoustic or instrumental version, edit, or a cover or tribute by another artist.",
  "The same recording by the same artist. Differences are only spelling, punctuation, capitalization, featured-artist credits, or labels such as Original Mix, Radio Edit, or Remastered.",
] as const;

export type Relation = "different" | "version" | "same";
const RELATIONS: readonly Relation[] = ["different", "version", "same"];

export type CandidateJudgment = {
  track: CatalogTrack;
  relation: Relation;
  /** Probability-weighted level from 0 (different) to 2 (same recording). */
  score: number;
  confidence: number;
};

/** Ask Jev how each catalog candidate relates to a playlist track, in one request. */
export async function judgeCandidates(
  wanted: Pick<PlaylistTrack, "title" | "artist">,
  candidates: CatalogTrack[],
): Promise<CandidateJudgment[]> {
  if (!candidates.length) return [];
  const questions: Record<string, ScoreQuestion<typeof RELATION_LEVELS>> = {};
  candidates.forEach((track, index) => {
    questions[`candidate_${index}`] = score({
      catalog_track: { title: track.title, artist: track.artist },
      question: "How does `catalog_track` relate to the song in `playlist_track`?",
    }, RELATION_LEVELS);
  });

  const { answers } = await jev().systemOne({
    state: { playlist_track: { title: wanted.title, artist: wanted.artist } },
    questions,
  });

  return candidates.map((track, index) => {
    const answer = answers[`candidate_${index}`];
    const level = Math.min(Math.max(Math.round(answer.score), 0), RELATIONS.length - 1);
    return { track, relation: RELATIONS[level], score: answer.score, confidence: answer.confidence };
  });
}

// ---------------------------------------------------------------------------
// Search: turn "calm piano to study to" into catalog tags and filters.
// ---------------------------------------------------------------------------

const GENRES = {
  ambient: null, electronic: null, lounge: null, jazz: null, classical: null, rock: null, pop: null,
  hiphop: null, folk: null, soundtrack: null, metal: null, reggae: null, blues: null, world: null,
  none: "No genre is stated or clearly implied.",
} as const;

const MOODS = {
  relaxing: null, happy: null, sad: null, energetic: null, dark: null, romantic: null, epic: null, dreamy: null,
  none: "No mood is stated or clearly implied.",
} as const;

// All five questions share one request; code only reads the filters when the query is a vibe.
const VIBE_QUESTIONS = {
  intent: choice("What is `query` asking for?", {
    named: "A specific song, artist, or album by name.",
    vibe: "Music that fits a feeling, mood, activity, setting, genre, or sound, without naming a specific song or artist.",
  }),
  genre: choice("Which genre best fits the music that `query` asks for?", GENRES),
  mood: choice("Which mood best fits the music that `query` asks for?", MOODS),
  speed: choice("What tempo does `query` ask for?", {
    verylow: "Very slow", low: "Slow", medium: "Moderate", high: "Fast", veryhigh: "Very fast",
    any: "No tempo is stated or clearly implied.",
  }),
  vocals: choice("Does `query` ask for music with or without singing?", {
    vocal: "With singing or lyrics.",
    instrumental: "Without vocals.",
    any: "Not stated or clearly implied.",
  }),
};

/** A judgment becomes a search filter only at or above this confidence. */
const FILTER_CONFIDENCE = 0.5;

function confident<T extends string, U extends T>(answer: { choice: T; confidence: number }, unset: U) {
  return answer.choice !== unset && answer.confidence >= FILTER_CONFIDENCE ? answer.choice as Exclude<T, U> : undefined;
}

/**
 * Returns catalog filters when the query describes a vibe rather than naming
 * music, or null when a plain text search is the better fit.
 */
export async function interpretQuery(query: string): Promise<VibeFilters | null> {
  const { answers } = await jev().systemOne({ state: { query }, questions: VIBE_QUESTIONS });
  if (!confident(answers.intent, "named")) return null;

  const tags = [confident(answers.genre, "none"), confident(answers.mood, "none")]
    .filter((tag) => tag !== undefined);
  // Tempo or vocals alone would return an arbitrary slice of the catalog.
  if (!tags.length) return null;

  return {
    tags,
    speed: confident(answers.speed, "any"),
    vocals: confident(answers.vocals, "any"),
  };
}
