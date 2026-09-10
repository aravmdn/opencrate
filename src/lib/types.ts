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

export type TrackMatch = {
  source: PlaylistTrack;
  match: CatalogTrack | null;
};

