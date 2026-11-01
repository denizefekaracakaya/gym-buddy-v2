# Gym Buddy — Mobile Architecture Decision

Status: **accepted** (2026-11-01). Based on the audit in `MOBILE_MIGRATION_AUDIT.md`.

## Decision

**Capacitor 8** wraps the existing React 19 + Vite 6 + TypeScript app as a native
Android app. The backend is **Supabase** (project `gym-buddy-ai`,
`ksxjmzesbwaijiocwbwx`): Supabase Auth (e-mail + password), Postgres table
`public.user_data` protected by Row Level Security, and the Gemini proxy as the
`ai-proxy` **Supabase Edge Function**.

> **Change of direction (2026-11-01):** the first version of this branch kept
> Firebase and used a Cloudflare Worker for Gemini. The owner then decided to drop
> Firebase entirely ("Firebase ile uğraşmak istemiyorum"). Reasons that made this
> cheap: Firebase cloud sync had never worked (wrong database id, see audit), so
> there was no Firestore user data to migrate; Email/Password sign-in was disabled
> there; and a Supabase project with the same data model (`user_data`) already
> existed from an earlier prototype. Using Edge Functions also removes the separate
> Cloudflare account.

```
┌──────────── Android app (io.github.denizefekaracakaya.gymbuddy) ────────────┐
│ Capacitor 8 WebView ─ serves bundled dist/ from https://localhost           │
│  React UI (mobile shell: bottom nav, safe areas, back button)               │
│  supabase-js: Auth (session in localStorage, PKCE, auto refresh)            │
│               PostgREST upsert/select of own user_data row                  │
│  localStorage mirror + "unsynced" flag → offline edits uploaded later       │
│  Native plugins: App Camera Haptics Keyboard Network LocalNotifications     │
│                  SplashScreen StatusBar Browser                             │
└───────────────┬──────────────────────────────────┬──────────────────────────┘
                │ HTTPS (publishable key + user JWT)│ POST /functions/v1/ai-proxy
                ▼                                   ▼
  Supabase project ksxjmzesbwaijiocwbwx      Edge Function ai-proxy (Deno)
  ├ Auth (email/password, e-mail links →     ├ checks the user via /auth/v1/user
  │   io.github…gymbuddy://auth-callback)    ├ per-user rate limit, input validation
  └ Postgres public.user_data (RLS:          ├ builds prompts (moved from the client)
      owner-only, authenticated role)        └ Gemini API (key = function secret)
```

### Data model (unchanged shape)

`public.user_data(id uuid PK → auth.users, profile jsonb, logs jsonb, water_data jsonb, created_at, updated_at)`
— one row per user, same three objects the app always used. Rows written by the
earlier prototype (`logs = {v1:{…}, v2:[…]}`) are read transparently. Migration
`supabase/migrations/20261101130000_harden_user_data.sql` adds owner-only policies
for the `authenticated` role, revokes all privileges from `anon`, object/size
check constraints and an `updated_at` trigger.

### Offline behaviour

Supabase has no client-side database cache, so the app keeps the existing
`localStorage` mirror: every change is written locally first and flagged
"unsynced" until the upsert succeeds. On next start / when the network returns,
unsynced local data is uploaded before cloud data is used. Conflict policy is
last-write-wins per user (one row), which is acceptable for a single-user app but
can lose edits made on two devices while both were offline.

## Options evaluated

### A. Capacitor — chosen

| Concern | Finding |
|---|---|
| React 19 / Vite 6 | Capacitor is framework-agnostic; it ships the `dist/` folder. No code changes required to run. |
| Routing | App has no router (tab enum) → no deep-link/history issues; back button handled via `@capacitor/app`. |
| Browser-only code | `signInWithPopup`, Web Notifications, `alert()`, `target=_blank`, CDN scripts — each replaced or guarded (see below). |
| Auth persistence | supabase-js stores the session in WebView `localStorage` (persistent across restarts) and refreshes tokens automatically. E-mail links return via a custom-scheme deep link and PKCE code exchange. |
| Database | PostgREST over HTTPS; no WebView-specific issues. |
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
| Firebase Cloud Functions | Required Blaze billing; Firebase dropped anyway. |
| Cloudflare Worker | Used in the first iteration; replaced to avoid a second provider/account. |
| **Supabase Edge Function** (chosen) | Included in the free plan, same project as auth/data, secrets managed in the dashboard. |

Design (`supabase/functions/ai-proxy/`):

* **Auth:** `Authorization: Bearer <Supabase access token>`; the function asks
  Supabase Auth (`GET /auth/v1/user`) and requires `role = authenticated`, so the
  public anon/publishable key alone cannot use it. Deployed with
  `verify_jwt = false` only so CORS preflights pass; auth is enforced in code.
  Anonymous use of AI is no longer possible (previously anyone could use the key).
* **Allow-listed tasks only:** `workoutPlan, exerciseImage, calorieAdvice,
  bodyFatAdvice, mealImage, mealText, parseWorkout, waterImage, chat`. The client
  sends inputs, never prompts or model names.
* **Validation:** lengths, enums, numeric ranges, image MIME allow-list
  (jpeg/png/webp), base64 check, ≤ 6 MB image payload, ≤ 8 MB body, chat ≤ 30
  messages × 4,000 chars, roles restricted to `user`/`model`.
* **Limits:** per-user 10 req/min and 200 req/day per function instance (best effort);
  hard cost cap = quota on the Gemini key in Google AI Studio / Cloud console.
* **Errors:** mapped to stable codes (`auth_required`, `rate_limited`, `ai_quota`,
  `ai_timeout`, `ai_error`…) with Turkish messages; upstream bodies never forwarded.
* **Logging:** task name, status, latency only — no prompts, images, e-mail or uid.
* **Models (with fallback):** text/vision `gemini-3.6-flash` (thinking level
  "low") → `gemini-3.5-flash-lite`; illustrations `gemini-nano-banana-2.1` →
  `gemini-3.1-flash-image` → `gemini-3.1-flash-lite-image`. On 404/429/5xx/timeout
  the next model is tried. Chosen from measurements on 2026-11-01: the original
  `gemini-2.5-flash` returned 404 for the project key and `gemini-3.8-flash`
  timed out (>40 s). `GEMINI_TEXT_MODEL` / `GEMINI_IMAGE_MODEL` secrets override
  the first choice without an app update.
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
| CSP | production `index.html` allows scripts only from the bundle, network only to the Supabase project origin (https/wss) |
| Deep link | `io.github.denizefekaracakaya.gymbuddy://auth-callback` (auth e-mails) |

### Permissions (merged manifest, verified with `aapt2 dump badging`)

| Permission | Source | Why | When asked |
|---|---|---|---|
| INTERNET | app | Supabase, AI function | install-time |
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
| `signInWithPopup` (Firebase Google) | removed; e-mail/password via Supabase. Google OAuth can be added later (Supabase provider + deep link). |
| `new Notification` + `setInterval` | 24 h of reminders scheduled via LocalNotifications, rescheduled on resume |
| `<input type=file capture>` | `Camera.getPhoto` with native prompt, resized to ≤1280 px JPEG |
| `<a target=_blank>` | `Browser.open` (Custom Tab) |
| `alert()` | inline status messages |
| CDN Tailwind / Google Fonts / esm.sh `marked` | bundled Tailwind 3, `@fontsource/inter`, npm `marked` + DOMPurify |
