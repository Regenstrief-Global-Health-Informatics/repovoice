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

## iOS / TestFlight

The App Store / TestFlight binary is a **Capacitor iOS shell** around the Vite **client** build (`dist/client`). It does **not** wrap a remote website. Recording, live browser STT, IndexedDB, settings, and GitHub push run on the device. Cloud Grok/Whisper STT in the iOS app calls xAI/OpenAI directly (keys stay in Settings); the hosted web app still uses TanStack server functions.

**Do not enable In-App Purchase, push, HealthKit, camera, or other paid capabilities** — OpenMRS Inc. is on the fee-waiver program.

### Prerequisites

- A Mac with Xcode
- App Store Connect app already exists: **RepoVoice**, bundle ID `org.openmrs.repovoice`, SKU `openmrs-repovoice`
- Signing team: **OpenMRS Inc.** (automatic signing)

### Build the web client and sync into Xcode

```bash
npm install
npm run ios:sync
```

That runs `vite build --config vite.config.ios.ts` (static SPA → `dist/client`) and `cap sync ios`.

Open the native project:

```bash
npm run ios:open
```

Or open `ios/App/App.xcodeproj` in Xcode (Swift Package Manager — no CocoaPods / `.xcworkspace`).

### Simulator smoke test

1. In Xcode, pick an iPhone simulator and press Run
2. When prompted, **allow the microphone**
3. Record a short take (live browser STT if offered), stop, confirm it appears in the library
4. Optional: add GitHub settings and push; optional: add an xAI key for Grok STT

### Archive and upload to TestFlight

1. Xcode → Signing & Capabilities → Team **OpenMRS Inc.**, **Automatically manage signing**
2. Confirm Bundle Identifier is `org.openmrs.repovoice`
3. Do not add In-App Purchase or any paid capability
4. Destination: **Any iOS Device (arm64)**
5. **Product → Archive**
6. **Distribute App → App Store Connect → Upload**
7. In App Store Connect, add the build to TestFlight

Privacy policy (GitHub Pages, do not remove): `docs/privacy.html` / `docs/index.html`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on `0.0.0.0:8080` |
| `npm run build` | Production (hosted / Vercel) build |
| `npm run build:ios` | Static Vite client for Capacitor (`dist/client`) |
| `npm run ios:sync` | Client build + `cap sync ios` |
| `npm run ios:open` | Open the Xcode project |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

## Privacy note

Audio blobs live in **IndexedDB** on the device. Metadata is in **localStorage**. Cloud STT and GitHub only run when you configure keys and go online (or when a queued job syncs).

## License

Private / your org — adjust as needed.
