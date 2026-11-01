# Gym Buddy — Mobile Architecture Decision

Status: **accepted** (2026-11-01). Based on the audit in `MOBILE_MIGRATION_AUDIT.md`.

## Decision

**Capacitor 8** wraps the existing React 19 + Vite 6 + TypeScript app as a native
Android app. Gemini moves behind a small **Cloudflare Worker** proxy that verifies
Firebase ID tokens. Firebase Auth + Firestore stay as they are (same project, same
database, same `users/{uid}` schema).

```
┌──────────── Android app (io.github.denizefekaracakaya.gymbuddy) ────────────┐
│ Capacitor 8 WebView  ─ serves bundled dist/ from https://localhost          │
│  React UI (unchanged components, mobile shell: bottom nav, safe areas)      │
│  Firebase JS SDK: Auth (IndexedDB persistence) + Firestore (persistent cache)│
│  Native plugins: App(back/lifecycle) Camera Haptics Keyboard Network        │
│                  LocalNotifications SplashScreen StatusBar Browser          │
└───────────────┬───────────────────────────────┬─────────────────────────────┘
                │ Firebase SDK (HTTPS)           │ POST /v1/ai  Authorization: Bearer <ID token>
                ▼                                ▼
   Firebase project gen-lang-client-0975287872   Cloudflare Worker gym-buddy-ai-proxy
   ├ Auth                                        ├ verifies ID token (Google JWKS, aud/iss)
   └ Firestore (named DB ai-studio-…)            ├ per-user rate limit, input validation
       users/{uid} {profile, logs, waterData}    ├ builds prompts (moved from the client)
                                                 └ Gemini API (key = Worker secret)
```

## Options evaluated

### A. Capacitor — chosen

| Concern | Finding |
|---|---|
| React 19 / Vite 6 | Capacitor is framework-agnostic; it ships the `dist/` folder. No code changes required to run. |
| Routing | App has no router (tab enum) → no deep-link/history issues; back button handled via `@capacitor/app`. |
| Browser-only code | `signInWithPopup`, Web Notifications, `alert()`, `target=_blank`, CDN scripts — each replaced or guarded (see below). |
| Firebase Auth persistence | Auth initialised with `initializeAuth(..., indexedDBLocalPersistence)` on native (no popup resolver). Session survives app restart (WebView IndexedDB is persistent). |
| Firestore | Same JS SDK; `persistentLocalCache` gives offline reads and queued writes. |
| Gemini | Never called from the device any more (see proxy). |
| Camera / gallery | `@capacitor/camera` (camera intent + Android photo picker) → no CAMERA / storage permissions. Verified on emulator. |
| Notifications | `@capacitor/local-notifications`; permission asked when the user enables reminders. |
| System bars | Capacitor 8 is edge-to-edge; CSS uses `env(safe-area-inset-*)`; status bar style set to light icons. |
| iOS later | `npx cap add ios` reuses the same web code and plugins (all chosen plugins support iOS). |
| Maintenance | One codebase, web and Android; a small team can keep using React/Tailwind. |

### B. React Native / Expo — rejected

Every component renders DOM (`div`, `select`, `details`, `<svg>` paths, Tailwind
classes, `dangerouslySetInnerHTML`, Recharts on SVG DOM). None of the ~2,900 lines of
UI would run in React Native; all 12 components would need to be rewritten with RN
primitives and a different chart library. Only `types.ts`, the formulas and the
service layer would carry over. The gain (native widgets) does not justify a rewrite
for a first beta, and the rewrite would put feature parity at risk.

### C. Others

* **TWA / PWA (Trusted Web Activity)** — needs a hosted HTTPS origin with Digital
  Asset Links; the current hosting is AI-Studio-managed `run.app` domains that we do
  not control, and native camera/notification APIs would be limited. Rejected.
* **Flutter / Kotlin native** — full rewrite. Rejected for the same reasons as B.

## Gemini security boundary

| Option | Verdict |
|---|---|
| Firebase Cloud Functions | Requires the Blaze plan (billing account). Owner declined billing for now. |
| **Cloudflare Worker** (chosen) | Free plan (100k requests/day), no cold starts, Web-standard `fetch` — the handler is unit-tested in Node. Needs a Cloudflare account + `wrangler login` by the owner. |
| Vercel/Netlify function | Equivalent; Worker chosen because the handler is plain `Request → Response` with no framework. |

Design (`server/ai-proxy/`):

* **Auth:** `Authorization: Bearer <Firebase ID token>`; verified with `jose`
  against Google's securetoken JWKS (`iss`, `aud` = project id, RS256, `auth_time`).
  Anonymous use of AI is no longer possible (previously anyone could use the key).
* **Allow-listed tasks only:** `workoutPlan, exerciseImage, calorieAdvice,
  bodyFatAdvice, mealImage, mealText, parseWorkout, waterImage, chat`. The client
  sends inputs, never prompts or model names.
* **Validation:** lengths, enums, numeric ranges, image MIME allow-list
  (jpeg/png/webp), base64 check, ≤ 6 MB image payload, ≤ 8 MB body, chat ≤ 30
  messages × 4,000 chars, roles restricted to `user`/`model`.
* **Limits:** per-user 10 req/min and 200 req/day per Worker isolate (best effort);
  hard cost cap = quota on the Gemini key in Google AI Studio / Cloud console.
* **Errors:** mapped to stable codes (`auth_required`, `rate_limited`, `ai_quota`,
  `ai_timeout`, `ai_error`…) with Turkish messages; upstream bodies never forwarded.
* **Logging:** task name, status, latency only — no prompts, images, e-mail or uid.
* **Models:** `gemini-2.5-flash` (text/vision) and `gemini-2.5-flash-image`
  (illustrations), configurable via Worker vars without an app update.
* Calories and body fat are now computed **in code** (Mifflin-St Jeor, US Navy) on
  the device; the AI only writes advice around the computed numbers.

## Android configuration

| Item | Value |
|---|---|
| Application ID | `io.github.denizefekaracakaya.gymbuddy` (permanent) |
| Name | Gym Buddy |
| Version | `versionName` 0.1.0-beta.1; `versionCode` = CI run number (monotonic) |
| minSdk / target / compile | 24 / 36 / 36 (Capacitor 8 defaults) |
| Orientation | portrait (Android 16 ignores this on large screens) |
| Backup | disabled (`allowBackup=false`, data-extraction rules exclude everything) — health data is restored from the account instead |
| Cleartext HTTP | disabled |
| WebView debugging | disabled in release (`webContentsDebuggingEnabled: false`) |
| CSP | production `index.html` allows scripts only from the bundle (+ Google sign-in on web), network only to `*.googleapis.com` and the proxy origin |

### Permissions (merged manifest, verified with `aapt2 dump badging`)

| Permission | Source | Why | When asked |
|---|---|---|---|
| INTERNET | app | Firebase, AI proxy | install-time |
| ACCESS_NETWORK_STATE | @capacitor/network | offline banner | install-time |
| POST_NOTIFICATIONS | local-notifications | water reminders (Android 13+) | runtime, only when the user turns reminders on; denial shows how to enable it in Settings |
| RECEIVE_BOOT_COMPLETED, WAKE_LOCK | local-notifications | keep scheduled reminders after reboot | install-time |
| VIBRATE | @capacitor/haptics | light haptic feedback | install-time |
| ~~SCHEDULE_EXACT_ALARM~~ | removed via `tools:node="remove"` | reminders don't need minute precision | — |

No camera, storage or location permissions: the camera is used through the system
camera app and images through the Android photo picker.

### Browser APIs replaced

| Before | After (native) |
|---|---|
| `signInWithPopup` (Google) | hidden on Android (needs native Google Sign-In + registered SHA-1; planned) |
| `new Notification` + `setInterval` | 24 h of reminders scheduled via LocalNotifications, rescheduled on resume |
| `<input type=file capture>` | `Camera.getPhoto` with native prompt, resized to ≤1280 px JPEG |
| `<a target=_blank>` | `Browser.open` (Custom Tab) |
| `alert()` | inline status messages |
| CDN Tailwind / Google Fonts / esm.sh `marked` | bundled Tailwind 3, `@fontsource/inter`, npm `marked` + DOMPurify |
