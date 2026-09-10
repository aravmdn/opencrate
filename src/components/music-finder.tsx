"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { CatalogTrack, PlaylistTrack, TrackMatch } from "@/lib/types";

type Props = {
  catalogConfigured: boolean;
  spotifyConfigured: boolean;
};

type IconName = "arrow" | "check" | "download" | "github" | "headphones" | "link" | "music" | "pause" | "play" | "search" | "spark" | "spotify";

const pathByIcon: Record<IconName, React.ReactNode> = {
  arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
  github: <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7A5.4 5.4 0 0 0 19.4 4 5 5 0 0 0 19.3.5S18.2.1 15 1.8a13.4 13.4 0 0 0-7 0C4.8.1 3.7.5 3.7.5A5 5 0 0 0 3.6 4a5.4 5.4 0 0 0-1.4 3.7c0 5.3 3.5 6.5 6.8 7A4.8 4.8 0 0 0 8 18v4M8 19c-3 .9-3-1.5-4-2"/>,
  headphones: <><path d="M4 14a8 8 0 0 1 16 0"/><path d="M18 19h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1v6ZM6 19H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1v6Z"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/></>,
  music: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  pause: <><path d="M9 5v14"/><path d="M15 5v14"/></>,
  play: <path d="m8 5 11 7-11 7V5Z"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  spark: <><path d="m12 3 1.4 4.3L18 9l-4.6 1.7L12 15l-1.4-4.3L6 9l4.6-1.7L12 3Z"/><path d="m5 15 .7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7L5 15Z"/></>,
  spotify: <><circle cx="12" cy="12" r="9"/><path d="M7.5 10a12 12 0 0 1 9.8 1"/><path d="M8 13a10 10 0 0 1 8.4.8"/><path d="M8.5 16a8 8 0 0 1 7 .6"/></>,
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{pathByIcon[name]}</svg>;
}

function formatTime(seconds: number) {
  if (!seconds) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function parseTextTracks(value: string): PlaylistTrack[] {
  return value.split("\n").map((line, index) => {
    const [title, ...artistParts] = line.split(/\s+[—–-]\s+/);
    const artist = artistParts.join(" - ").trim();
    if (!title?.trim() || !artist) return null;
    return { id: `text-${index}`, title: title.trim(), artist, album: "Pasted list", artwork: "", spotifyUrl: "" };
  }).filter((track): track is PlaylistTrack => Boolean(track)).slice(0, 50);
}

export function MusicFinder({ catalogConfigured, spotifyConfigured }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CatalogTrack[]>([]);
  const [searchError, setSearchError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
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
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetch("/api/spotify/status").then((response) => response.json()).then((data) => setSpotifyConnected(Boolean(data.connected))).catch(() => undefined);
    queueMicrotask(() => {
      const saved = sessionStorage.getItem("opencrate_playlist_url");
      if (saved) setPlaylistUrl(saved);
      const savedDownloads = localStorage.getItem("opencrate_downloads");
      if (savedDownloads) {
        try { setDownloaded(new Set(JSON.parse(savedDownloads) as string[])); } catch { /* Ignore malformed local data. */ }
      }
    });
  }, []);

  useEffect(() => {
    if (!audioRef.current || !nowPlaying) return;
    audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [nowPlaying]);

  async function runSearch(term: string) {
    const clean = term.trim();
    if (clean.length < 2) return;
    setSearching(true);
    setSearchError("");
    setHasSearched(true);
    try {
      const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(clean)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed.");
      setResults(data.tracks || []);
    } catch (error) {
      setResults([]);
      setSearchError(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    runSearch(query);
  }

  async function findMatches(tracks: PlaylistTrack[]) {
    setImportStatus(`Searching the open catalog for ${tracks.length} tracks…`);
    const response = await fetch("/api/catalog/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracks }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Matching failed.");
    setMatches(data.matches || []);
    const found = (data.matches as TrackMatch[]).filter((item) => item.match).length;
    setImportStatus(`Found ${found} artist-approved match${found === 1 ? "" : "es"} for ${tracks.length} tracks.`);
  }

  async function importPlaylist(event: FormEvent) {
    event.preventDefault();
    if (!playlistUrl.trim()) return;
    sessionStorage.setItem("opencrate_playlist_url", playlistUrl.trim());
    if (!spotifyConnected) {
      if (!spotifyConfigured) {
        setImportStatus("Spotify OAuth is not configured on this instance. Use the text import below or add credentials.");
        return;
      }
      router.push("/api/spotify/login");
      return;
    }

    setImporting(true);
    setMatches([]);
    setImportStatus("Reading playlist metadata from Spotify…");
    try {
      const response = await fetch(`/api/spotify/import?url=${encodeURIComponent(playlistUrl)}`);
      const data = await response.json();
      if (data.needsAuth) {
        setSpotifyConnected(false);
        router.push("/api/spotify/login");
        return;
      }
      if (!response.ok) throw new Error(data.error || "Playlist import failed.");
      await findMatches(data.tracks || []);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "Playlist import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function submitTextTracks(event: FormEvent) {
    event.preventDefault();
    const tracks = parseTextTracks(textTracks);
    if (!tracks.length) {
      setImportStatus("Use one track per line in the format Song title — Artist.");
      return;
    }
    setImporting(true);
    setMatches([]);
    try {
      await findMatches(tracks);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "Matching failed.");
    } finally {
      setImporting(false);
    }
  }

  function playTrack(track: CatalogTrack) {
    if (nowPlaying?.id === track.id && audioRef.current) {
      if (audioRef.current.paused) audioRef.current.play(); else audioRef.current.pause();
      return;
    }
    setNowPlaying(track);
  }

  function recordDownload(track: CatalogTrack) {
    const next = new Set(downloaded).add(track.id);
    setDownloaded(next);
    localStorage.setItem("opencrate_downloads", JSON.stringify([...next]));
  }

  const downloadedCount = downloaded.size;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="OpenCrate home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span>OPEN<br/><b>CRATE</b></span>
        </a>
        <nav className="nav" aria-label="Main navigation">
          <a className="active" href="#discover"><Icon name="spark"/> Discover</a>
          <a href="#playlist"><Icon name="link"/> Playlist import</a>
          <a href="#library"><Icon name="download"/> Downloads <span className="nav-count">{downloadedCount}</span></a>
        </nav>
        <div className="sidebar-note">
          <span className="live-dot"/> OPEN SOURCE
          <p>Music discovery with the rights kept in the room.</p>
          <a href="https://github.com/aravmdn/opencrate" target="_blank" rel="noreferrer"><Icon name="github"/> View on GitHub</a>
        </div>
        <p className="sidebar-foot">Powered by Jamendo<br/>Spotify metadata only</p>
      </aside>

      <main id="top">
        <header className="topbar">
          <div className="eyebrow"><span>01</span> OPEN MUSIC FINDER</div>
          <a className="github-button" href="https://github.com/aravmdn/opencrate" target="_blank" rel="noreferrer"><Icon name="github"/> Star on GitHub</a>
        </header>

        <section className="hero" id="discover">
          <div className="hero-copy">
            <div className="kicker"><span className="kicker-line"/> SEARCH. LISTEN. KEEP.</div>
            <h1>YOUR NEXT<br/><em>FAVORITE</em><br/>TRACK IS OPEN.</h1>
            <p>Find music artists have actually cleared for download. No ripping, no mystery files—just an open catalog and the license to prove it.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="record record-back"><span/></div>
            <div className="record record-front"><span className="record-label"><b>OPEN</b><small>PLAY IT LOUD</small></span></div>
            <div className="catalog-stamp">OPEN<br/>CATALOG<br/><b>↗</b></div>
            <span className="scribble">artist approved!</span>
          </div>
        </section>

        <section className="search-panel">
          <form className="search-form" onSubmit={submitSearch}>
            <Icon name="search" size={24}/>
            <label className="sr-only" htmlFor="catalog-search">Search tracks, artists, or moods</label>
            <input id="catalog-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tracks, artists, or moods…" autoComplete="off"/>
            <button disabled={searching || query.trim().length < 2}>{searching ? "DIGGING…" : "DIG IN"}<Icon name="arrow"/></button>
          </form>
          <div className="quick-search"><span>TRY A MOOD</span>{["late night", "lo-fi", "electric", "cinematic"].map((term) => <button key={term} onClick={() => { setQuery(term); runSearch(term); }}>#{term.replace(" ", "")}</button>)}</div>
        </section>

        {!catalogConfigured && <div className="config-banner"><Icon name="spark"/><div><b>Catalog key needed</b><span>Add <code>JAMENDO_CLIENT_ID</code> to <code>.env.local</code> to switch on live search and downloads. The interface is ready.</span></div></div>}

        <section className="results-section" aria-live="polite">
          <div className="section-heading">
            <div><span className="section-number">01 / DISCOVER</span><h2>{hasSearched ? `RESULTS FOR “${query.toUpperCase()}”` : "START WITH A FEELING"}</h2></div>
            {hasSearched && !searching && <span className="result-count">{results.length} TRACK{results.length === 1 ? "" : "S"}</span>}
          </div>
          {searchError && <div className="empty-state"><Icon name="music" size={28}/><b>Crate came up empty</b><p>{searchError}</p></div>}
          {!hasSearched && <div className="genre-grid">
            <button onClick={() => { setQuery("ambient"); runSearch("ambient"); }} className="genre-card genre-one"><span>01</span><b>AMBIENT</b><small>SPACE TO THINK ↗</small></button>
            <button onClick={() => { setQuery("electronic"); runSearch("electronic"); }} className="genre-card genre-two"><span>02</span><b>ELECTRONIC</b><small>WIRED FOR MOTION ↗</small></button>
            <button onClick={() => { setQuery("jazz"); runSearch("jazz"); }} className="genre-card genre-three"><span>03</span><b>JAZZ</b><small>LOOSE &amp; LATE ↗</small></button>
          </div>}
          {hasSearched && !searching && !searchError && !results.length && <div className="empty-state"><Icon name="search" size={28}/><b>No open matches yet</b><p>Try a broader title, artist, genre, or mood.</p></div>}
          {!!results.length && <div className="track-list">{results.map((track, index) => <TrackRow key={track.id} track={track} index={index + 1} active={nowPlaying?.id === track.id && isPlaying} downloaded={downloaded.has(track.id)} onPlay={playTrack} onDownload={recordDownload}/>)}</div>}
        </section>

        <section className="playlist-section" id="playlist">
          <div className="playlist-intro">
            <span className="section-number light">02 / PLAYLIST MATCHER</span>
            <h2>BRING THE LIST.<br/><em>FIND THE OPEN CUT.</em></h2>
            <p>Paste a Spotify playlist you own or collaborate on. OpenCrate reads the track names, then looks for exact, downloadable releases in the open catalog.</p>
            <div className="flow"><span><b>01</b> Paste URL</span><i>→</i><span><b>02</b> Match metadata</span><i>→</i><span><b>03</b> Download allowed tracks</span></div>
          </div>
          <div className="import-card">
            <div className="import-card-head"><span className="spotify-icon"><Icon name="spotify" size={25}/></span><div><b>SPOTIFY PLAYLIST</b><small>METADATA IMPORT</small></div>{spotifyConnected && <span className="connected"><Icon name="check" size={13}/> CONNECTED</span>}</div>
            <form onSubmit={importPlaylist}>
              <label htmlFor="playlist-url">PLAYLIST LINK</label>
              <div className="url-field"><Icon name="link"/><input id="playlist-url" type="url" value={playlistUrl} onChange={(event) => setPlaylistUrl(event.target.value)} placeholder="https://open.spotify.com/playlist/…"/><button disabled={importing || !playlistUrl.trim()}>{importing ? "MATCHING…" : spotifyConnected ? "FIND MATCHES" : "CONNECT & IMPORT"}</button></div>
            </form>
            <p className="privacy-note"><span>●</span> We use track metadata only. Spotify audio is never downloaded or copied.</p>
            <button className="text-toggle" onClick={() => setShowTextImport((value) => !value)}>{showTextImport ? "Hide text import" : "Can’t connect? Paste a track list instead"} <span>↗</span></button>
            {showTextImport && <form className="text-import" onSubmit={submitTextTracks}><label htmlFor="text-tracks">ONE PER LINE: SONG — ARTIST</label><textarea id="text-tracks" value={textTracks} onChange={(event) => setTextTracks(event.target.value)} placeholder={'Midnight Drive — The Satellites\nSoft Focus — June Street'}/><button disabled={importing}>MATCH TEXT LIST</button></form>}
            {importStatus && <div className="import-status"><span className={importing ? "status-spinner" : "status-mark"}>{importing ? "" : "✓"}</span>{importStatus}</div>}
          </div>
        </section>

        {!!matches.length && <section className="results-section match-results"><div className="section-heading"><div><span className="section-number">MATCH REPORT</span><h2>WHAT WE FOUND</h2></div><span className="result-count">{matches.filter((item) => item.match).length} / {matches.length} OPEN</span></div><div className="match-list">{matches.map((item, index) => item.match ? <TrackRow key={`${item.source.id}-${index}`} track={item.match} index={index + 1} active={nowPlaying?.id === item.match.id && isPlaying} downloaded={downloaded.has(item.match.id)} onPlay={playTrack} onDownload={recordDownload} source={item.source}/> : <div className="no-match" key={`${item.source.id}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.source.title}</b><small>{item.source.artist}</small></div><em>NO EXACT OPEN MATCH</em></div>)}</div></section>}

        <section className="principles" id="library">
          <span className="section-number">03 / THE DEAL</span>
          <div className="principles-grid"><h2>OPEN<br/>BY<br/><em>DESIGN.</em></h2><div className="principle"><b>01</b><h3>ARTIST-APPROVED</h3><p>The download button appears only when the source says downloads are allowed.</p></div><div className="principle"><b>02</b><h3>LICENSE VISIBLE</h3><p>Every result links back to its source and Creative Commons license when supplied.</p></div><div className="principle"><b>03</b><h3>NO LOCK-IN</h3><p>MIT licensed, self-hostable, and built in public. Your crate stays yours.</p></div></div>
        </section>

        <footer><a className="brand footer-brand" href="#top"><span className="brand-mark"><span/><span/><span/></span><span>OPEN<br/><b>CRATE</b></span></a><p>Built for the long tail of sound.</p><div><a href="https://developer.jamendo.com/v3.0" target="_blank" rel="noreferrer">API</a><a href="https://github.com/aravmdn/opencrate#readme" target="_blank" rel="noreferrer">Docs</a><a href="https://github.com/aravmdn/opencrate/blob/main/LICENSE" target="_blank" rel="noreferrer">MIT License</a></div></footer>
      </main>

      {nowPlaying && <div className="player"><button className="player-play" onClick={() => playTrack(nowPlaying)} aria-label={isPlaying ? "Pause" : "Play"}><Icon name={isPlaying ? "pause" : "play"}/></button><Artwork track={nowPlaying}/><div className="player-copy"><b>{nowPlaying.title}</b><span>{nowPlaying.artist}</span></div><div className="player-wave" aria-hidden="true">{Array.from({ length: 38 }).map((_, index) => <i key={index} style={{ height: `${8 + ((index * 13) % 22)}px` }}/>)}</div><a className="player-download" href={`/api/catalog/download?id=${nowPlaying.id}`} onClick={() => recordDownload(nowPlaying)}><Icon name="download"/> DOWNLOAD</a><audio ref={audioRef} src={nowPlaying.streamUrl} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)}/></div>}
    </div>
  );
}

function Artwork({ track }: { track: CatalogTrack }) {
  return <div className="artwork">{track.artwork ? <Image src={track.artwork} alt="" fill sizes="64px" unoptimized/> : <span>{track.title.slice(0, 1)}</span>}</div>;
}

function TrackRow({ track, index, active, downloaded, onPlay, onDownload, source }: { track: CatalogTrack; index: number; active: boolean; downloaded: boolean; onPlay: (track: CatalogTrack) => void; onDownload: (track: CatalogTrack) => void; source?: PlaylistTrack }) {
  return <article className="track-row"><span className="track-index">{String(index).padStart(2, "0")}</span><button className={`artwork-button ${active ? "playing" : ""}`} onClick={() => onPlay(track)} aria-label={`${active ? "Pause" : "Play"} ${track.title}`}><Artwork track={track}/><span className="play-overlay"><Icon name={active ? "pause" : "play"}/></span></button><div className="track-copy"><h3>{track.title}</h3><p>{track.artist} <span>·</span> {track.album}</p>{source && <small>Matched from “{source.title}” by {source.artist}</small>}</div><div className="license-pill"><span/><a href={track.licenseUrl || track.sourceUrl} target="_blank" rel="noreferrer">{track.licenseUrl ? "CC LICENSE" : "SOURCE"}</a></div><span className="track-time">{formatTime(track.duration)}</span><a className={`download-button ${downloaded ? "done" : ""}`} href={`/api/catalog/download?id=${track.id}`} onClick={() => onDownload(track)} aria-label={`Download ${track.title}`}><Icon name={downloaded ? "check" : "download"}/><span>{downloaded ? "SAVED" : "MP3"}</span></a></article>;
}
