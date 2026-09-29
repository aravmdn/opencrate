export type CatalogTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  duration: number;
  streamUrl: string;
  downloadAllowed: boolean;
  licenseUrl: string;
  sourceUrl: string;
};

export type PlaylistTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  spotifyUrl: string;
};

/** How a match was found: identical normalized metadata, or a Jev same-recording judgment. */
export type MatchMethod = "exact" | "jev";

export type MatchResult = {
  /** A downloadable catalog track that is the same recording, or null. */
  match: CatalogTrack | null;
  method?: MatchMethod;
  /** Jev's confidence in its judgment, from 0 to 1. Only set when `method` is "jev". */
  confidence?: number;
  /** A downloadable different version (remix, live, cover) the listener should check before keeping. */
  alternate?: CatalogTrack | null;
};

export type TrackMatch = MatchResult & {
  source: PlaylistTrack;
};

export type Tempo = "verylow" | "low" | "medium" | "high" | "veryhigh";

/** Catalog filters that Jev inferred from a mood, activity, or genre description. */
export type VibeFilters = {
  tags: string[];
  speed?: Tempo;
  vocals?: "vocal" | "instrumental";
};
