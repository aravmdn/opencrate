# Contributing to OpenCrate

Thanks for helping make open music easier to find. Bug reports, accessibility feedback, documentation
fixes, and code are all welcome.

## Ground rule: rights first

OpenCrate only works with music that artists have cleared for download. Any audio source must expose an
explicit download permission or a compatible license, and OpenCrate must check it before offering a
download. Please do not submit stream-ripping integrations, DRM workarounds, search scrapers, or sources
that distribute music without authorization. Those pull requests will be closed.

## Getting set up

```bash
git clone https://github.com/<you>/opencrate.git
cd opencrate
npm install
cp .env.example .env.local   # add a free JAMENDO_CLIENT_ID to try the app
npm run dev                  # http://127.0.0.1:3000
```

You do not need any credentials to run the tests: `npm test` mocks Jamendo, Spotify, and TypeSafe.

## Making a change

1. Open an issue first for anything larger than a small fix, so we can agree on the approach.
2. Create a focused branch from `main`.
3. Keep changes small and match the surrounding style. `src/lib` holds provider clients and policy;
   `src/components` holds the UI.
4. Add or update tests in `tests/` for behavior changes. Mock network calls with the helpers in
   `tests/helpers.ts`; tests must never call real APIs.
5. Run the full check before opening a pull request:

   ```bash
   npm run check   # lint, typecheck, tests
   npm run build
   ```

6. Open a pull request describing the behavior change and how you verified it.

## UI and accessibility

OpenCrate targets WCAG 2.2 AA. For UI changes, please:

- use native elements (`<button>`, `<a>`, `<label>`) rather than clickable `<div>`s;
- give every control a clear accessible name, and mark decorative icons `aria-hidden`;
- keep text contrast at 4.5:1 or higher (3:1 for large text and focus indicators);
- try the change with the keyboard only, and at a phone-sized viewport.

## Working with Jev

Jev (`src/lib/jev.ts`) should answer narrow judgments; keep policy in code. When changing a question,
test it on real examples in the [TypeSafe playground](https://console.typesafe.ai/playground), include
the cases you tried in your pull request, and keep the fallback path working when `TYPESAFE_API_KEY`
is unset or the API fails.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to
uphold it.
