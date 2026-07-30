# RepoVoice

Offline-first **interview & reflection** recorder that:

- Captures audio in the browser (works as a PWA on iPhone Safari)
- Transcribes with **Grok STT** (speaker diarization) or Whisper / browser live STT
- Links takes to **people slugs** from a GitHub repo
- Commits audio + Markdown notes into a flat **`interviews/`** folder

Built with React 19, TanStack Start, Vite, Tailwind, Zustand, IndexedDB.

## Features

| Area | Behavior |
| --- | --- |
| **Session types** | `Interview` or `Reflection` — filenames include the type |
| **People** | Load slugs from a configurable folder (e.g. `people/`) |
| **Offline** | Record, queue STT & GitHub push; sync when back online |
| **GitHub** | Contents API push; folder tree picker for paths |
| **iOS** | Add to Home Screen (Safari) for app-like use |

### Repo layout (configurable)

```text
people/
  jane-doe.md          # bio / questions (markdown)
interviews/
  jane-doe_interview_2026-….m4a
  jane-doe_interview_2026-….md
  jane-doe_reflection_2026-….m4a
  jane-doe_reflection_2026-….md
```

## Quick start

```bash
npm install
npm run dev          # http://localhost:8080
```

```bash
npm run typecheck
npm run build
```

## Configure in the app

Open **Settings** in the UI (keys stay in your browser):

1. **GitHub** — owner, repo, branch, classic PAT with `repo` (+ org SSO if needed)
2. **People folder** — e.g. `people`
3. **Interviews folder** — e.g. `interviews`
4. **xAI API key** — for Grok STT (recommended for diarization)
5. Optional **OpenAI** key — for Whisper

Never commit PATs or API keys to this repository.

## Deploy

This project is a standard Vite / TanStack Start app. Deploy to Vercel, Netlify, or any Node host that can run the production build.

- Production entry uses Nitro’s Vercel preset when you run `npm run build`
- After deploy, open the HTTPS URL in **Safari** on iPhone → **Share → Add to Home Screen** for the full PWA experience

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on `0.0.0.0:8080` |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

## Privacy note

Audio blobs live in **IndexedDB** on the device. Metadata is in **localStorage**. Cloud STT and GitHub only run when you configure keys and go online (or when a queued job syncs).

## License

Private / your org — adjust as needed.
