# OpenCrate

**Find music that is free to keep.** OpenCrate searches Jamendo's open catalog, streams previews, and offers an MP3 download only when the artist has explicitly enabled it. It can also read a Spotify playlist's metadata and look for exact, lawful matches in the open catalog.

> OpenCrate does not download, copy, or rip audio from Spotify. Spotify is a metadata input only. A match is downloadable only when the catalog provider reports `audiodownload_allowed: true`.

## What it does

- Search by track, artist, genre, or mood
- Preview tracks before downloading
- Download artist-approved MP3s through Jamendo's official file endpoint
- Display the Creative Commons license or source link with every result
- Import up to 100 tracks from a Spotify playlist you own or collaborate on
- Paste a plain-text track list when Spotify access is unavailable
- Match conservatively: normalized exact title plus artist, never a fuzzy guess
- Track saved items locally in the browser; no database or account required
- Work across desktop and mobile with keyboard and reduced-motion support

## Stack

- Next.js 16 App Router and TypeScript
- React 19
- Next.js route handlers for provider credentials, OAuth, matching, and verified download redirects
- Plain CSS—no component library or analytics

## Run locally

```bash
git clone https://github.com/aravmdn/opencrate.git
cd opencrate
npm install
cp .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

### Jamendo setup

1. Register an application in the [Jamendo developer portal](https://devportal.jamendo.com/).
2. Put the client ID in `.env.local`:

```dotenv
JAMENDO_CLIENT_ID=your_client_id
```

Search, previews, matching, and downloads use Jamendo's official API. OpenCrate re-checks download permission immediately before redirecting to a file.

### Spotify setup

Spotify import is optional; text-list matching works without it.

1. Create a Web API application in the [Spotify developer dashboard](https://developer.spotify.com/dashboard).
2. Add `http://127.0.0.1:3000/api/spotify/callback` to its redirect URIs. Use the exact origin where OpenCrate runs.
3. Add the credentials to `.env.local`:

```dotenv
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

Current Spotify Web API rules restrict playlist-item access to playlists the signed-in user owns or collaborates on. The user must authorize `playlist-read-private`; availability can also depend on Spotify account and app mode. OpenCrate keeps the short-lived access token in a secure, HTTP-only, same-site cookie, never exposes it to client JavaScript, and asks the user to reconnect after it expires.

## How matching works

```text
Spotify URL or text list
          │ metadata only
          ▼
  normalized title + artist
          │ exact match
          ▼
 Jamendo open catalog result
          │ permission checked again
          ▼
 official download redirect
```

OpenCrate prefers a false negative over returning the wrong recording. It compares a normalized exact title and primary artist, then filters out every result where the artist has disabled downloads.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `JAMENDO_CLIENT_ID` | For catalog features | Jamendo API access |
| `SPOTIFY_CLIENT_ID` | For Spotify import | Spotify OAuth client |
| `SPOTIFY_CLIENT_SECRET` | For Spotify import | Spotify server-side OAuth exchange |

Never commit `.env.local`. All `.env*` files except `.env.example` are ignored.

## Deployment notes

- Use HTTPS in production and register the production callback URL as `{origin}/api/spotify/callback`.
- Add rate limiting at the edge before exposing a popular public instance.
- Provider terms and API behavior can change. Review both providers' policies before production deployment.
- The in-memory UI stores download history only in `localStorage`; it is not synced.

## Development

```bash
npm run lint
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a new audio source. Integrations must expose explicit download authorization or a compatible license. Stream ripping and DRM bypasses are out of scope.

## License

[MIT](LICENSE) © 2026 Arav Madan
