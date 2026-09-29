"use client";

import { type FormEvent, useEffect, useEffectEvent, useRef, useState } from "react";
import { Icon, NewTab } from "@/components/icon";
import { Artwork, type MatchBadge, TrackRow } from "@/components/track-row";
import { parseTrackList } from "@/lib/track-list";
import type { CatalogTrack, PlaylistTrack, TrackMatch, VibeFilters } from "@/lib/types";

type Props = {
  catalogConfigured: boolean;
  spotifyConfigured: boolean;
  jevConfigured: boolean;
};

const REPO_URL = "https://github.com/aravmdn/opencrate";
const PLAYLIST_KEY = "opencrate_playlist_url";
const DOWNLOADS_KEY = "opencrate_downloads";
const MATCH_BATCH = 5;
const SECTIONS = [
  { id: "discover", label: "Discover", icon: "spark" },
  { id: "playlist", label: "Playlist import", icon: "link" },
  { id: "about", label: "About OpenCrate", icon: "music" },
] as const;

// Messages for the ?spotify= status the OAuth callback redirects back with.
const SPOTIFY_RESULTS: Record<string, string> = {
  connected: "Spotify connected.",
  denied: "Spotify access was not granted. You can paste a track list instead.",
  invalid_state: "The Spotify sign-in expired or was interrupted. Please try again.",
  token_error: "Spotify did not complete the sign-in. Please try again.",
  not_configured: "Spotify import is not configured on this instance.",
};

const SPEED_LABELS: Record<string, string> = { verylow: "very slow", low: "slow", medium: "mid-tempo", high: "fast", veryhigh: "very fast" };

// Storage can throw in private browsing or when blocked; it only holds conveniences.
function readStorage(area: "local" | "session", key: string): string | null {
  try { return (area === "local" ? localStorage : sessionStorage).getItem(key); } catch { return null; }
}

function writeStorage(area: "local" | "session", key: string, value: string) {
  try { (area === "local" ? localStorage : sessionStorage).setItem(key, value); } catch { /* Not persisted. */ }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try { return await response.json(); } catch { return {}; }
}

function plural(count: number, word: string, suffix = "s") {
  return `${count} ${word}${count === 1 ? "" : suffix}`;
}

function badgeFor(item: TrackMatch): MatchBadge | undefined {
  if (item.match && item.method === "jev") return { label: `Jev match · ${Math.round((item.confidence ?? 0) * 100)}% sure`, tone: "jev" };
  if (item.match) return { label: "Exact match", tone: "exact" };
  if (item.alternate) return { label: "Different version: check before keeping", tone: "version" };
}

function vibeChips(vibe: VibeFilters): string[] {
  return [
    ...vibe.tags,
    ...(vibe.speed ? [SPEED_LABELS[vibe.speed]] : []),
    ...(vibe.vocals ? [vibe.vocals] : []),
  ];
}

export function MusicFinder({ catalogConfigured, spotifyConfigured, jevConfigured }: Props) {
  const [query, setQuery] = useState("");
  const [searchedTerm, setSearchedTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CatalogTrack[]>([]);
  const [vibe, setVibe] = useState<VibeFilters | null>(null);
  const [searchError, setSearchError] = useState("");
  const [searchAnnouncement, setSearchAnnouncement] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [matches, setMatches] = useState<TrackMatch[]>([]);
  const [showTextImport, setShowTextImport] = useState(false);
  const [textTracks, setTextTracks] = useState("");
  const [nowPlaying, setNowPlaying] = useState<CatalogTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);
  const audioRef = useRef<HTMLAudioElement>(null);
  const searchRequest = useRef(0);

  const resumeImportAfterSignIn = useEffectEvent((url: string) => {
    setPlaylistUrl(url);
    void importFrom(url);
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spotifyResult = params.get("spotify");
    const savedUrl = readStorage("session", PLAYLIST_KEY);

    if (spotifyResult) {
      params.delete("spotify");
      const search = params.size ? `?${params}` : "";
      window.history.replaceState(null, "", `${window.location.pathname}${search}#playlist`);
      document.getElementById("playlist")?.scrollIntoView();
    }

    queueMicrotask(() => {
      if (savedUrl) setPlaylistUrl(savedUrl);
      try {
        const savedDownloads = readStorage("local", DOWNLOADS_KEY);
        if (savedDownloads) setDownloaded(new Set(JSON.parse(savedDownloads) as string[]));
      } catch { /* Ignore malformed local data. */ }
      if (spotifyResult && spotifyResult !== "connected") {
        setImportStatus(SPOTIFY_RESULTS[spotifyResult] ?? "Spotify sign-in did not finish.");
      }
    });

    fetch("/api/spotify/status")
      .then(readJson)
      .then((data) => {
        const connected = Boolean(data.connected);
        setSpotifyConnected(connected);
        // The listener chose "Connect & import", so continue the import they started.
        if (spotifyResult === "connected" && connected && savedUrl) resumeImportAfterSignIn(savedUrl);
        else if (spotifyResult === "connected") setImportStatus(SPOTIFY_RESULTS.connected);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!audioRef.current || !nowPlaying) return;
    audioRef.current.play().catch(() => setIsPlaying(false));
  }, [nowPlaying]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: "-35% 0px -55% 0px", threshold: [0, 0.25, 0.5] });
    SECTIONS.forEach(({ id }) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, []);

  async function runSearch(term: string, mode: "auto" | "text" = "auto") {
    const clean = term.trim();
    if (clean.length < 2) return;
    // Ignore responses from searches that a newer search replaced.
    const requestId = ++searchRequest.current;
    setSearching(true);
    setSearchError("");
    setSearchedTerm(clean);
    setVibe(null);
    setSearchAnnouncement(`Searching for ${clean}…`);
    try {
      const params = new URLSearchParams({ q: clean });
      if (mode === "text") params.set("mode", "text");
      const response = await fetch(`/api/catalog/search?${params}`);
      const data = await readJson(response);
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Search failed.");
      if (requestId !== searchRequest.current) return;
      const tracks = (data.tracks as CatalogTrack[] | undefined) ?? [];
      setResults(tracks);
      setVibe((data.vibe as VibeFilters | undefined) ?? null);
      setSearchAnnouncement(`${plural(tracks.length, "track")} found for ${clean}.`);
    } catch (error) {
      if (requestId !== searchRequest.current) return;
      const message = error instanceof Error ? error.message : "Search failed.";
      setResults([]);
      setSearchError(message);
      setSearchAnnouncement(message);
    } finally {
      if (requestId === searchRequest.current) setSearching(false);
    }
  }

  function searchFor(term: string) {
    setQuery(term);
    void runSearch(term);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    void runSearch(query);
  }

  async function findMatches(tracks: PlaylistTrack[]) {
    if (!tracks.length) {
      setImportStatus("This list has no supported music tracks to match.");
      return;
    }
    const allMatches: TrackMatch[] = [];
    for (let offset = 0; offset < tracks.length; offset += MATCH_BATCH) {
      setImportStatus(`Matching tracks ${offset + 1}–${Math.min(offset + MATCH_BATCH, tracks.length)} of ${tracks.length}…`);
      const response = await fetch("/api/catalog/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks: tracks.slice(offset, offset + MATCH_BATCH) }),
      });
      const data = await readJson(response);
      if (!response.ok) {
        const found = allMatches.length ? ` Kept results for the first ${allMatches.length} tracks.` : "";
        throw new Error(`${typeof data.error === "string" ? data.error : "Matching failed."}${found}`);
      }
      allMatches.push(...(data.matches as TrackMatch[]));
      setMatches([...allMatches]);
    }
    const found = allMatches.filter((item) => item.match).length;
    const versions = allMatches.filter((item) => !item.match && item.alternate).length;
    const versionNote = versions ? ` and ${plural(versions, "different version")} to check` : "";
    setImportStatus(`Found ${plural(found, "artist-approved match", "es")}${versionNote} for ${plural(tracks.length, "track")}.`);
  }

  async function importFrom(url: string) {
    setImporting(true);
    setMatches([]);
    setImportStatus("Reading playlist metadata from Spotify…");
    try {
      const response = await fetch(`/api/spotify/import?url=${encodeURIComponent(url)}`);
      const data = await readJson(response);
      if (data.needsAuth) {
        // No automatic redirect here: it could loop if the session cookie is blocked.
        setSpotifyConnected(false);
        setImportStatus("Your Spotify session has ended. Choose Connect & import to sign in again.");
        return;
      }
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Playlist import failed.");
      await findMatches((data.tracks as PlaylistTrack[] | undefined) ?? []);
      if (data.truncated) setImportStatus((status) => `${status} Only the first 100 playlist entries were imported.`);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "Playlist import failed.");
    } finally {
      setImporting(false);
    }
  }

  function importPlaylist(event: FormEvent) {
    event.preventDefault();
    const url = playlistUrl.trim();
    if (!url) return;
    writeStorage("session", PLAYLIST_KEY, url);
    if (spotifyConnected) {
      void importFrom(url);
    } else if (spotifyConfigured) {
      // OAuth needs a full page navigation to the route handler, not a client-side route change.
      window.location.assign(new URL("/api/spotify/login", window.location.origin).href);
    } else {
      setImportStatus("Spotify import is not configured on this instance. Paste a track list instead.");
      setShowTextImport(true);
    }
  }

  async function disconnectSpotify() {
    await fetch("/api/spotify/logout", { method: "POST" }).catch(() => undefined);
    setSpotifyConnected(false);
    setImportStatus("Disconnected from Spotify.");
  }

  async function submitTextTracks(event: FormEvent) {
    event.preventDefault();
    const { tracks, skipped, truncated } = parseTrackList(textTracks);
    if (!tracks.length) {
      setImportStatus("Use one track per line in the format Song title — Artist.");
      return;
    }
    setImporting(true);
    setMatches([]);
    try {
      await findMatches(tracks);
      const notes = [
        skipped ? `Skipped ${plural(skipped, "line")} without a “Song — Artist” pair.` : "",
        truncated ? "Only the first 100 tracks were matched." : "",
      ].filter(Boolean).join(" ");
      if (notes) setImportStatus((status) => `${status} ${notes}`);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "Matching failed.");
    } finally {
      setImporting(false);
    }
  }

  function playTrack(track: CatalogTrack) {
    if (nowPlaying?.id === track.id && audioRef.current) {
      if (audioRef.current.paused) audioRef.current.play().catch(() => setIsPlaying(false));
      else audioRef.current.pause();
      return;
    }
    setNowPlaying(track);
  }

  function recordDownload(track: CatalogTrack) {
    if (!track.downloadAllowed) return;
    const next = new Set(downloaded).add(track.id);
    setDownloaded(next);
    writeStorage("local", DOWNLOADS_KEY, JSON.stringify([...next]));
  }

  const rowProps = (track: CatalogTrack) => ({
    track,
    active: nowPlaying?.id === track.id && isPlaying,
    downloaded: downloaded.has(track.id),
    onPlay: playTrack,
    onDownload: recordDownload,
  });
  const matchedCount = matches.filter((item) => item.match).length;

  return (
    <div className={`app-shell ${nowPlaying ? "has-player" : ""}`}>
      <a className="skip-link" href="#catalog-search">Skip to search</a>
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="OpenCrate, back to top">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span aria-hidden="true">OPEN<br/><b>CRATE</b></span>
        </a>
        <nav className="nav" aria-label="Sections">
          {SECTIONS.map(({ id, label, icon }) => (
            <a key={id} href={`#${id}`} className={activeSection === id ? "active" : undefined} aria-current={activeSection === id ? "location" : undefined}>
              <Icon name={icon}/> {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" aria-hidden="true"/> Open source
          <p>Music discovery with the rights kept in the room.</p>
          <a href={REPO_URL} target="_blank" rel="noreferrer"><Icon name="github"/> View on GitHub<NewTab/></a>
        </div>
        <p className="sidebar-foot">Powered by Jamendo<br/>Spotify metadata only{jevConfigured && <><br/>Matching by Jev</>}</p>
      </aside>

      <main id="top">
        <header className="topbar">
          <div className="eyebrow"><span aria-hidden="true">01</span> Open music finder</div>
          <a className="github-button" href={REPO_URL} target="_blank" rel="noreferrer"><Icon name="github"/> Star on GitHub<NewTab/></a>
        </header>

        <section className="hero" id="discover" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="kicker"><span className="kicker-line" aria-hidden="true"/> Search. Listen. Keep.</p>
            <h1 id="hero-title">Your next<br/><em>favorite</em><br/>track is open.</h1>
            <p>Find music artists have actually cleared for download. No ripping, no mystery files, just an open catalog and the license to prove it.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="record record-back"><span/></div>
            <div className="record record-front"><span className="record-label"><b>OPEN</b><small>PLAY IT LOUD</small></span></div>
            <div className="catalog-stamp">OPEN<br/>CATALOG<br/><b>↗</b></div>
            <span className="scribble">artist approved!</span>
          </div>
        </section>

        <section className="search-panel" aria-label="Search the open catalog">
          <form className="search-form" role="search" onSubmit={submitSearch}>
            <Icon name="search" size={24}/>
            <label className="sr-only" htmlFor="catalog-search">Search tracks, artists, or moods</label>
            <input id="catalog-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={jevConfigured ? "Try “calm piano to study to” or an artist…" : "Search tracks, artists, or moods…"} autoComplete="off" enterKeyHint="search"/>
            <button type="submit" disabled={searching || query.trim().length < 2}>{searching ? "Digging…" : "Dig in"}<Icon name="arrow"/></button>
          </form>
          <div className="quick-search">
            <span id="quick-search-label">Try a mood</span>
            <ul aria-labelledby="quick-search-label">
              {["late night", "lo-fi", "rainy day jazz", "cinematic"].map((term) => (
                <li key={term}><button type="button" onClick={() => searchFor(term)}>#{term.replaceAll(" ", "")}</button></li>
              ))}
            </ul>
          </div>
        </section>

        {!catalogConfigured && <div className="config-banner" role="note"><Icon name="spark"/><div><b>Catalog key needed</b><span>Add <code>JAMENDO_CLIENT_ID</code> to <code>.env.local</code> to switch on live search and downloads. See the README for a two-minute setup.</span></div></div>}

        <section className="results-section" aria-labelledby="results-title" aria-busy={searching}>
          <p className="sr-only" role="status">{searchAnnouncement}</p>
          <div className="section-heading">
            <div><span className="section-number">01 / Discover</span><h2 id="results-title">{searchedTerm ? `Results for “${searchedTerm}”` : "Start with a feeling"}</h2></div>
            {searchedTerm && !searching && !searchError && <span className="result-count">{plural(results.length, "track")}</span>}
          </div>
          {vibe && !searching && (
            <div className="vibe-note">
              <span>Jev read this as</span>
              <ul aria-label="Search filters">{vibeChips(vibe).map((chip) => <li key={chip}>{chip}</li>)}</ul>
              <button type="button" onClick={() => runSearch(searchedTerm, "text")}>Search the exact words instead</button>
            </div>
          )}
          {searchError && <div className="empty-state"><Icon name="music" size={28}/><b>Crate came up empty</b><p>{searchError}</p></div>}
          {!searchedTerm && <ul className="genre-grid" aria-label="Start with a genre">
            <li><button type="button" onClick={() => searchFor("ambient")} className="genre-card genre-one"><span aria-hidden="true">01</span><b>Ambient</b><small>Space to think <span aria-hidden="true">↗</span></small></button></li>
            <li><button type="button" onClick={() => searchFor("electronic")} className="genre-card genre-two"><span aria-hidden="true">02</span><b>Electronic</b><small>Wired for motion <span aria-hidden="true">↗</span></small></button></li>
            <li><button type="button" onClick={() => searchFor("jazz")} className="genre-card genre-three"><span aria-hidden="true">03</span><b>Jazz</b><small>Loose &amp; late <span aria-hidden="true">↗</span></small></button></li>
          </ul>}
          {searchedTerm && !searching && !searchError && !results.length && <div className="empty-state"><Icon name="search" size={28}/><b>No open matches yet</b><p>Try a broader title, artist, genre, or mood.</p></div>}
          {!!results.length && <ol className="track-list" aria-label={`Results for ${searchedTerm}`}>
            {results.map((track, index) => <TrackRow key={track.id} index={index + 1} {...rowProps(track)}/>)}
          </ol>}
        </section>

        <section className="playlist-section" id="playlist" aria-labelledby="playlist-title">
          <div className="playlist-intro">
            <span className="section-number light">02 / Playlist matcher</span>
            <h2 id="playlist-title">Bring the list.<br/><em>Find the open cut.</em></h2>
            <p>Paste a Spotify playlist you own or collaborate on. OpenCrate reads the track names, then looks for downloadable releases of the same recordings in the open catalog.</p>
            {jevConfigured && <p className="jev-note"><Icon name="spark" size={14}/> Jev recognizes remasters, radio edits, and featured-artist credits, and flags remixes or covers for you to check.</p>}
            <ol className="flow"><li><b>01</b> Paste URL</li><li><b>02</b> Match metadata</li><li><b>03</b> Download allowed tracks</li></ol>
          </div>
          <div className="import-card">
            <div className="import-card-head">
              <span className="spotify-icon" aria-hidden="true"><Icon name="spotify" size={25}/></span>
              <div><b>Spotify playlist</b><small>Metadata import</small></div>
              {spotifyConnected && <span className="connected"><Icon name="check" size={13}/> Connected</span>}
            </div>
            <form onSubmit={importPlaylist}>
              <label htmlFor="playlist-url">Playlist link</label>
              <div className="url-field">
                <Icon name="link"/>
                <input id="playlist-url" type="text" inputMode="url" autoComplete="off" spellCheck={false} value={playlistUrl} onChange={(event) => setPlaylistUrl(event.target.value)} placeholder="https://open.spotify.com/playlist/…" aria-describedby="privacy-note"/>
                <button type="submit" disabled={importing || !playlistUrl.trim()}>{importing ? "Matching…" : spotifyConnected ? "Find matches" : "Connect & import"}</button>
              </div>
            </form>
            <p className="privacy-note" id="privacy-note"><span aria-hidden="true">●</span> We use track metadata only. Spotify audio is never downloaded or copied.</p>
            {spotifyConnected && <button type="button" className="text-button" onClick={disconnectSpotify}>Disconnect Spotify</button>}
            <button type="button" className="text-toggle" aria-expanded={showTextImport} aria-controls="text-import" onClick={() => setShowTextImport((value) => !value)}>
              {showTextImport ? "Hide text import" : "Can’t connect? Paste a track list instead"} <span aria-hidden="true">{showTextImport ? "↑" : "↓"}</span>
            </button>
            {showTextImport && <form className="text-import" id="text-import" onSubmit={submitTextTracks}>
              <label htmlFor="text-tracks">One per line: Song — Artist</label>
              <textarea id="text-tracks" value={textTracks} onChange={(event) => setTextTracks(event.target.value)} placeholder={"Midnight Drive — The Satellites\nSoft Focus - June Street"}/>
              <button type="submit" disabled={importing || !textTracks.trim()}>Match text list</button>
            </form>}
            <div role="status" aria-live="polite">
              {importStatus && <div className="import-status">{importing ? <span className="status-spinner" aria-hidden="true"/> : <span className="status-mark" aria-hidden="true">✓</span>}{importStatus}</div>}
            </div>
          </div>
        </section>

        {!!matches.length && <section className="results-section match-results" aria-labelledby="match-title">
          <div className="section-heading">
            <div><span className="section-number">Match report</span><h2 id="match-title">What we found</h2></div>
            <span className="result-count">{matchedCount} / {matches.length} open</span>
          </div>
          <ol className="match-list">
            {matches.map((item, index) => {
              const track = item.match ?? item.alternate;
              if (track) return <TrackRow key={`${item.source.id}-${index}`} index={index + 1} source={item.source} badge={badgeFor(item)} {...rowProps(track)}/>;
              return (
                <li className="no-match" key={`${item.source.id}-${index}`}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div><b>{item.source.title}</b><small>{item.source.artist}</small></div>
                  <em>No open match</em>
                </li>
              );
            })}
          </ol>
        </section>}

        <section className="principles" id="about" aria-labelledby="about-title">
          <span className="section-number">03 / The deal</span>
          <div className="principles-grid">
            <h2 id="about-title">Open<br/>by<br/><em>design.</em></h2>
            <div className="principle"><b aria-hidden="true">01</b><h3>Artist-approved</h3><p>The download button appears only when the source says downloads are allowed, and permission is checked again before every download.</p></div>
            <div className="principle"><b aria-hidden="true">02</b><h3>License visible</h3><p>Every result links back to its source and Creative Commons license when supplied.</p></div>
            <div className="principle"><b aria-hidden="true">03</b><h3>No lock-in</h3><p>MIT licensed, self-hostable, and built in public. Your crate stays yours.</p></div>
          </div>
        </section>

        <footer>
          <a className="brand footer-brand" href="#top" aria-label="OpenCrate, back to top"><span className="brand-mark" aria-hidden="true"><span/><span/><span/></span><span aria-hidden="true">OPEN<br/><b>CRATE</b></span></a>
          <p>Built for the long tail of sound.</p>
          <ul>
            <li><a href="https://developer.jamendo.com/v3.0" target="_blank" rel="noreferrer">Jamendo API<NewTab/></a></li>
            <li><a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">Docs<NewTab/></a></li>
            <li><a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT License<NewTab/></a></li>
          </ul>
        </footer>
      </main>

      {nowPlaying && <section className="player" aria-label="Now playing">
        <button type="button" className="player-play" onClick={() => playTrack(nowPlaying)} aria-label={`${isPlaying ? "Pause" : "Play"} ${nowPlaying.title}`}><Icon name={isPlaying ? "pause" : "play"}/></button>
        <Artwork track={nowPlaying}/>
        <div className="player-copy"><b>{nowPlaying.title}</b><span>{nowPlaying.artist}</span></div>
        <div className="player-wave" aria-hidden="true">{Array.from({ length: 38 }).map((_, index) => <i key={index} style={{ height: `${8 + ((index * 13) % 22)}px` }}/>)}</div>
        {nowPlaying.downloadAllowed && <a className="player-download" href={`/api/catalog/download?id=${nowPlaying.id}`} target="_blank" rel="noreferrer" onClick={() => recordDownload(nowPlaying)} aria-label={`Download MP3 of ${nowPlaying.title} (opens in a new tab)`}><Icon name="download"/> <span>Download</span></a>}
        <audio ref={audioRef} src={nowPlaying.streamUrl} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)}/>
      </section>}
    </div>
  );
}
