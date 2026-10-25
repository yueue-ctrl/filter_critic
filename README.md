# Critroom

A local, responsive critique app with accounts, folders, image/link previews, project invitations, text/drawing/audio feedback, and persisted takeaway decisions. Requires Node.js 22.13+; the local AI installer currently targets macOS with Python 3.9+.

## Start with free local AI

```sh
npm install
npm run setup:local
npm run dev
```

Open http://localhost:3000. The first setup downloads an official Ollama runtime, Qwen3 4B (~2.5 GB), and a multilingual Whisper small speech model (~500 MB), plus Python dependencies. Allow several GB of disk space. The installer verifies the Ollama release checksum, installs a project-local Python environment, and records the downloaded speech model revision.

The default provider is **local**. No OpenAI key, API balance, account, or per-request API payment is required. After model downloads, recordings are transcribed offline by faster-whisper/PyAV and takeaways are generated through a loopback-only Ollama service. Runtime transcription disables Hugging Face network access. Cloud model names and remote Ollama URLs are rejected. An existing OpenAI key is ignored in local mode, and there is no automatic paid fallback.

Data lives in `data/critique.sqlite`; models and temporary workers live in `.local-ai/`. Both folders and `.env` are ignored by Git. Temporary decoded audio files are removed after processing; original recordings are automatically deleted as soon as the transcript is successfully saved. Failed transcriptions retain their audio for retry. Previously transcribed recordings are also removed from the active database at startup. The app starts the local text runtime when needed. Keep the app running while processing; interrupted analysis can be retried without rerecording.

Optional `.env` settings:

```env
AI_PROVIDER=local
OLLAMA_MODEL=qwen3:4b
OLLAMA_URL=http://127.0.0.1:11434
```

The separate OpenAI adapter remains available only through explicit `AI_PROVIDER=openai` configuration. It is not used by the default setup.

## Workflow

- Create an account and project. Upload a PNG/JPEG/WebP or paste an HTTP(S) link. Project names appear in navigation. Links that block embedding must be opened with Open original link; Figma links use an embed preview.
- START CRITIQUE creates a saved session, QR invitation and eight-character join code. Participants can join after signing in and submit text, drawings and recordings.
- Record, pause/resume and Finish Critique. Finishing saves the current clip, closes submissions, automatically transcribes each recording locally and generates evidence-backed takeaways. Successful transcriptions are cached as text for retries; initial transcript text is preserved separately. Audio is deleted in the same database update that saves the transcript, even if takeaway generation later fails. Feedback views and exports retain the text and takeaways without audio players for deleted recordings.
- Organizing opens automatically. Swipe up / Arrow Up / Trash to discard a takeaway; swipe down / Arrow Down / Keep to retain it. Undo restores the latest decision. Finalize adds kept takeaways to project Feedback. Trash never deletes original evidence.
- Profile, personal folders, invited folders and shared profiles are available through Settings. Folder invitations grant access to current and future projects in that folder; project invitations grant access only to one project. Other profiles show only name, ID and shared accessible projects.

Model-generated takeaways are checked against real evidence IDs and original text. Independent contributors and explicit agreements determine consensus counts. Opposite suggestions should remain separate. Drawings without text are reviewable evidence; they are not visually analyzed. Short or noisy recordings can yield no actionable takeaways. Local model quality and speed depend on hardware. Word-level audio timing and speaker diarization are not implemented.

## Multiple devices and deployment

The app listens on `0.0.0.0`. On the same network, open `http://<computer-LAN-IP>:3000`; share invitations generated using that address. A phone cannot access the computer through a localhost QR link. Microphone/camera access requires HTTPS except on localhost; existing audio/QR images can be uploaded instead.

Use `PUBLIC_URL` for a public invitation base URL, `PORT` for the server port, `DATA_DIR` for the database directory and `COOKIE_SECURE=true` behind HTTPS. SQLite and local AI require a persistent host. Before deploying a Vercel frontend, move identity/database/files to hosted services and run local inference on a separate reachable service. Vercel alone cannot run this desktop-local setup.

This is a prototype: email verification, password reset, invitation revocation, account deletion and full audit controls are not yet implemented. Existing feedback prevents replacing a project image to preserve drawing coordinates; use a new project for a new version.

## Verification

```sh
npm test
```

Tests cover accounts and access isolation, project/folder invitations, QR decoding, all feedback types, AI source validation, recording/transcript recovery, Keep/Trash/Finalize persistence, and confirmation that the local provider never calls a paid API even when an OpenAI key exists. Adapter tests use mocked network responses; actual local model checks are run separately after setup.

Local components: [Ollama](https://github.com/ollama/ollama), [Qwen3 4B](https://ollama.com/library/qwen3:4b), [faster-whisper](https://github.com/SYSTRAN/faster-whisper).

Organizing animates each downward swipe or Keep click using the supplied collection motion with the current takeaway text. A card stays locked until both animation and saving finish. Repeated pointer events, held arrow keys, and trackpad momentum do not collect the next card. Failed saves restore the current card; Undo remains available after a successful decision. Reduced-motion preferences skip the collection animation.

The home screen uses the supplied animated character at the viewport bottom. Its animation restarts after the entry loader finishes. A browser refresh while signed in resets that account's owned projects, feedback, critiques, and takeaways, then returns to an empty home screen; accounts and sessions remain. Normal navigation and browser Back/Forward do not reset the workspace. Other users' owned projects are not deleted. Download feedback before refreshing if you want an offline copy.

Organizing shows both destination characters in their first frames while idle. Upward dragging scrubs the supplied trash animation; downward dragging scrubs the keep animation. Releasing a committed gesture continues from the previewed frame and saves only that card. Both animations replace their original caption with the actual takeaway, and the inactive destination stays visible.
