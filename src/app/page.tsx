import { MusicFinder } from "@/components/music-finder";

export default function Home() {
  return (
    <MusicFinder
      catalogConfigured={Boolean(process.env.JAMENDO_CLIENT_ID)}
      spotifyConfigured={Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)}
    />
  );
}
