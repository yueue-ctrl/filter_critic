# Critroom — temporary critique demo

Open the website, type a project name, record feedback, analyze it, organize the takeaway cards, and download the result. No sign-in, account, database, or shared project storage is required.

The current session exists only in the browser tab's memory. Refreshing creates a completely empty session, including when the URL contains an old project ID. There is no localStorage, sessionStorage, IndexedDB, or session cookie. A download is the user's own standalone HTML file containing the transcript, highlighted evidence, takeaways, and Keep/Trash decisions. Audio is released from the browser after successful analysis. Failed analysis retains the recording only in that tab for retry.

## Run locally

Requires Node.js 22.x.

```sh
npm install
npm run dev
```

Open http://localhost:3000. The default server is `demo-server.js`; it does not initialize or open SQLite.

With `GEMINI_API_KEY` in `.env`, analysis uses Gemini. Without that key, local development can use the previously installed offline Whisper and Ollama models. To install those optional models on macOS:

```sh
npm run setup:local
```

The offline runtime is development-only and is never used by the Vercel API function. To preview the cloud configuration locally, including its missing-key error, set `DEMO_AI_PROVIDER=gemini`.

## Deploy the anonymous demo to Vercel

1. Import this GitHub repository as a Vercel project.
2. Add `GEMINI_API_KEY` as a server-side environment variable in the Vercel dashboard. Do not put it in browser code, a `VITE_`/`NEXT_PUBLIC_` variable, GitHub, or chat.
3. Optionally set `GEMINI_MODEL=gemini-2.5-flash` (the default).
4. Deploy. The included `vercel.json` runs `npm run build`, serves `dist/`, and exposes `api/analyze.js` and `api/config.js` as Node functions.

No Supabase project or database configuration is needed. Visitors do not need their own API key or model installation. Missing/invalid keys and exhausted quota show a retryable error; the app does not silently switch to a different paid service.

To use Gemini's free tier, create the key in an eligible, unbilled Google AI Studio project and keep billing disabled. The code cannot determine a key's billing tier: a key from a billed project can incur that project's normal charges. All visitors share the host project's quota. Free limits, model availability, and hosting terms may change; see the official [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), and [Vercel Hobby plan](https://vercel.com/docs/plans/hobby). Vercel Hobby is for personal, non-commercial use.

Cloud analysis sends audio directly in the analysis request to Google's Gemini API. The app does not upload it to a file-storage service, write it to a database, or log recording/transcript bodies. This does not override the AI provider's data policies: Gemini's free tier may use submitted content to improve its products. The recording page identifies Google as the analysis provider. See [Google's terms](https://ai.google.dev/gemini-api/terms).

## Recording and analysis

- Microphone access requires HTTPS or localhost. Modern browsers use WebM/Opus, M4A, or Ogg recording as supported.
- A clip is limited to 10 active recording minutes and 3 MB. Recording stops before the size limit where possible. Inline base64 requests remain below Vercel's 4.5 MB function-body limit. Longer recordings should be split into separate sessions.
- Gemini receives one request for transcription and structured takeaways. Exact quote substrings are validated against the returned transcript. Repeated matching quotes determine **mentions**, not an invented count of people. Repeated briefs are merged; opposite suggestions remain separate by prompt instruction.
- Browser recording buffers are cleared after capture, and the retained clip is released after a successful result. Refresh discards any failed/pending recording too. The optional offline worker uses a temporary decoded audio file and removes it after processing.
- The anonymous endpoint bounds request sizes, checks browser origins, and has best-effort per-instance request/concurrency limits. Provider quotas remain the shared account-level limit; the app cannot provide unlimited free inference.

## Organizing and export

Both destination characters show their first frames while idle. Upward dragging scrubs the supplied trash animation; downward dragging scrubs the keep animation. Releasing a committed gesture continues from that frame and processes only the current card. Takeaway text replaces the baked-in animation wording. Gestures, keyboard repeat, clicks, and trackpad momentum are guarded while an animation is active. Undo is available within the current organizing view. Reduced-motion preferences skip automatic playback.

Download embeds the Yomogi font and original transcript in a standalone HTML report, without audio. The report records all takeaways and their Keep/Trash decisions; only kept cards appear on the result homepage. The supplied font's OFL license is in `public/fonts/OFL.txt`.

## Checks

```sh
npm test
npm run build
```

Tests cover anonymous requests, no database/cookie creation in the demo server, refresh-equivalent fresh-session state, audio release, inline Gemini input, quote validation, duplicate merging, quota/configuration errors, exports, and one-card animation locking. Provider HTTP calls are mocked in tests; a configured Gemini key is required for a real cloud analysis check.

The earlier account/database prototype remains available through `npm run dev:workspace` and has separate legacy tests. It is not the website's default entry point and is not included in the static demo build. Local data/models/secrets and verification screenshots remain ignored by Git.
