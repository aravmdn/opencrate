import Image from "next/image";
import { Icon, NewTab } from "@/components/icon";
import type { CatalogTrack, PlaylistTrack } from "@/lib/types";

export type MatchBadge = { label: string; tone: "exact" | "jev" | "version" };

type TrackRowProps = {
  track: CatalogTrack;
  index: number;
  active: boolean;
  downloaded: boolean;
  onPlay: (track: CatalogTrack) => void;
  onDownload: (track: CatalogTrack) => void;
  source?: PlaylistTrack;
  badge?: MatchBadge;
};

function formatTime(seconds: number) {
  if (!seconds) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function Artwork({ track }: { track: CatalogTrack }) {
  return (
    <div className="artwork">
      {track.artwork ? <Image src={track.artwork} alt="" fill sizes="64px" unoptimized/> : <span aria-hidden="true">{track.title.slice(0, 1)}</span>}
    </div>
  );
}

export function TrackRow({ track, index, active, downloaded, onPlay, onDownload, source, badge }: TrackRowProps) {
  const name = `${track.title} by ${track.artist}`;
  return (
    <li className="track-row">
      <span className="track-index" aria-hidden="true">{String(index).padStart(2, "0")}</span>
      <button type="button" className={`artwork-button ${active ? "playing" : ""}`} disabled={!track.streamUrl} onClick={() => onPlay(track)} aria-label={`${active ? "Pause" : "Play"} preview of ${name}`}>
        <Artwork track={track}/><span className="play-overlay"><Icon name={active ? "pause" : "play"}/></span>
      </button>
      <div className="track-copy">
        <h3><a href={track.sourceUrl} target="_blank" rel="noreferrer">{track.title}<NewTab/></a></h3>
        <p>{track.artist} <span aria-hidden="true">·</span> {track.album}</p>
        {badge && <span className={`match-badge ${badge.tone}`}>{badge.label}</span>}
        {source && <small>
          {source.spotifyUrl
            ? <a href={source.spotifyUrl} target="_blank" rel="noreferrer"><Icon name="spotify" size={14}/> From “{source.title}” by {source.artist} on Spotify<NewTab/></a>
            : `From “${source.title}” by ${source.artist}`}
        </small>}
      </div>
      <div className="license-pill">
        <span aria-hidden="true"/>
        <a href={track.licenseUrl || track.sourceUrl} target="_blank" rel="noreferrer">
          {track.licenseUrl ? "CC license" : "Source"}<span className="sr-only"> for {track.title}</span><NewTab/>
        </a>
      </div>
      <span className="track-time"><span className="sr-only">Duration </span>{formatTime(track.duration)}</span>
      {track.downloadAllowed ? (
        <a
          className={`download-button ${downloaded ? "done" : ""}`}
          href={`/api/catalog/download?id=${track.id}`}
          target="_blank"
          rel="noreferrer"
          onClick={() => onDownload(track)}
          aria-label={`${downloaded ? "Download again" : "Download MP3 of"} ${name} (opens in a new tab)`}
          title="Opens the provider’s download; your browser handles saving the file"
        >
          <Icon name={downloaded ? "check" : "download"}/><span>{downloaded ? "Opened" : "MP3"}</span>
        </a>
      ) : <span className="stream-only">Stream only</span>}
    </li>
  );
}
