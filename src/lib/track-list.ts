import type { PlaylistTrack } from "@/lib/types";

export const MAX_LIST_TRACKS = 100;

/**
 * Parse a pasted list with one "Song title — Artist" per line. Em dashes, en
 * dashes, and spaced hyphens all work, and leading list numbers ("1.", "02)")
 * are ignored.
 */
export function parseTrackList(value: string): { tracks: PlaylistTrack[]; skipped: number; truncated: boolean } {
  const tracks: PlaylistTrack[] = [];
  let skipped = 0;

  value.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.replace(/^\s*\d{1,3}[.)]\s+/, "").trim();
    if (!line) return;
    const [title, ...artistParts] = line.split(/\s+[—–-]\s+/);
    const artist = artistParts.join(" - ").trim();
    if (!title?.trim() || !artist) {
      skipped++;
      return;
    }
    tracks.push({ id: `text-${index}`, title: title.trim(), artist, album: "", artwork: "", spotifyUrl: "" });
  });

  return { tracks: tracks.slice(0, MAX_LIST_TRACKS), skipped, truncated: tracks.length > MAX_LIST_TRACKS };
}
