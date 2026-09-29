# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Instead, report them privately through
[GitHub security advisories](https://github.com/aravmdn/opencrate/security/advisories/new).

Include what you found, how to reproduce it, and the impact you expect. You should get an initial
response within a week. Once a fix is available, we will credit you in the release notes unless you
prefer otherwise.

## Scope

Examples of issues we want to hear about:

- ways to obtain another user's Spotify token or bypass the OAuth state check;
- ways to make the download endpoint serve a track whose artist has not allowed downloads;
- server-side request forgery, open redirects, or injection through API routes;
- leaks of server-side secrets (`SPOTIFY_CLIENT_SECRET`, `TYPESAFE_API_KEY`, or a user's Spotify token).

The Jamendo client ID is a public app identifier: it appears in Jamendo's own stream and download URLs,
so seeing it in the browser is expected.

Rate limiting is intentionally left to the deployment (see the README); missing rate limits on a
self-hosted instance are not considered a vulnerability in OpenCrate itself.

## Supported versions

Security fixes are made on the `main` branch.
