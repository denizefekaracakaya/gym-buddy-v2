# Gym Buddy v2 — Mobile Migration Audit

Audit date: 2026-11-01
Audited commit: `23fff37` (`origin/main`, "docs: replace template with project README")
Repository: https://github.com/denizefekaracakaya/gym-buddy-v2

This audit is based on reading every source file in the repository, building
it, type-checking it, and probing the live Firebase project with read-only
requests. Statements marked **verified** were checked by running something;
everything else was found by reading the code.

## 0. Repository state at audit time

| Item | Finding |
|---|---|
| Remote branches | `main` only |
| Tags / releases | none |
| Pull requests | none (open or closed) |
| GitHub Actions | no workflows on `main`; no runs |
| History on `main` | 4 commits (`f3c01e7`, `7c58da5`, `d0236c9`, `23fff37`) |
| Local clone | The developer's local clone has **13 unpushed commits** (Jul 31 2026) that migrate to Supabase and add voice coach, coach memory, heat map, dashboard, ~2.6k LFS media files. **Decision (owner, 2026-11-01):** the Android beta is built from GitHub `main` (Firebase). The local work was preserved untouched on a local branch `archive/supabase-migration`; it was not pushed or merged. |

## 1. Actual architecture

```
index.html ── loads Tailwind from cdn.tailwindcss.com (runtime JIT), Inter from Google Fonts,
 │            an unused import map pointing at esm.sh, and a non-existent /index.css
 └ index.tsx → App.tsx  (single component holding all app state; no router)
     ├ state: currentUser uid, activeTab (enum), userProfile, logs, waterData
     ├ Firebase: onAuthStateChanged → getDoc(users/{uid}) → state
     ├ debounced (1 s) setDoc(users/{uid}, {profile, logs, waterData}, merge)
     ├ localStorage mirror `gym_buddy_backup_{uid}` (offline fallback)
     ├ water reminders: window.setInterval + `new Notification()`
     └ tab → component
         WorkoutPlanner  → geminiService.generateWorkoutPlan (+ 1 image call per exercise)
         WorkoutLog      → pure local state (logs)
         WaterTracker    → estimateWaterVolumeFromImage, Recharts LineChart
         CalorieCalculator → geminiService.calculateCalories (LLM does the math)
         BodyFatCalculator → geminiService.calculateBodyFat (LLM does the math)
         MealAnalyzer    → analyzeMealImage / analyzeMealFromText
         NutritionTips (AI Buddy chat) → ai.chats.create + sendMessageStream; marked from esm.sh
         Profile / Login → Firebase Auth (email+password, Google popup)
services/firebase.ts     — initializeApp, initializeFirestore, getAuth, error helper
services/geminiService.ts — @google/genai client constructed IN THE BROWSER with the API key
```

State management is plain React state in `App.tsx`, passed down as props. There
is no router; navigation is a `NavigationTab` enum. The whole user dataset is one
Firestore document.

The project originated in Google AI Studio ("Remix" in `metadata.json`), which
explains the CDN Tailwind, the import map and the AI-Studio-managed Firebase
project (`gen-lang-client-0975287872`) with a **named** Firestore database.

## 2. Dependencies (from `package.json`)

| Package | Version | Notes |
|---|---|---|
| react / react-dom | ^19.1.0 | |
| @google/genai | ^1.7.0 | used client-side |
| firebase | ^12.15.0 | Auth + Firestore |
| recharts | ^3.9.0 | one LineChart (water, 30 days) |
| vite | ^6.2.0 (6.4.3 installed) | |
| typescript | ~5.8.2 | |
| `marked` | **not in package.json** | imported from `https://esm.sh/marked@12.0.2` at runtime |
| Tailwind | **not in package.json** | CDN script at runtime |

Scripts: only `dev`, `build`, `preview`. **No tests, no lint, no typecheck
script** (verified).

## 3. Build and type-check (verified)

* `npm ci` + `vite build` succeed; single 1.74 MB JS chunk.
* `vite build` warns `/index.css doesn't exist at build time`.
* `tsc --noEmit` **fails with 3 errors**:
  1. `NutritionTips.tsx` — cannot resolve `https://esm.sh/marked@12.0.2`.
  2. `WorkoutLog.tsx:177` — `exercises` typed `unknown` (`Object.entries` on a Record).
  3. `services/firebase.ts:26` — `databaseId` is not a `FirestoreSettings` property.

## 4. Feature inventory and actual status

Legend: ✅ works as coded · ⚠️ works with defects · ❌ broken

| Feature | Trace (UI → service → backend → persistence) | Status | Findings |
|---|---|---|---|
| Registration / login (email) | Login → `createUserWithEmailAndPassword` / `signInWithEmailAndPassword` → Firebase Auth | ✅ code path | No password reset, no email verification, no "forgot password". |
| Google sign-in | `signInWithPopup` | ⚠️ web only | Popups do not work inside an Android WebView. |
| Session restore | `getAuth()` default persistence | ✅ web | Must use explicit IndexedDB persistence in a native WebView. |
| Profile | Profile form → `setUserProfile` → debounced Firestore write | ⚠️ | Text says data is "stored on your device" — wrong. Saved only via the global debounce. |
| **Cloud sync (all user data)** | `initializeFirestore(app, {databaseId})` | ❌ **broken** | `databaseId` is passed inside the *settings* object, which Firestore ignores, so the SDK talks to the `(default)` database. **Verified:** `(default)` does not exist in project `gen-lang-client-0975287872` (HTTP 404), while the named database `ai-studio-remixgymbuddyaif-…` exists (HTTP 403 for unauthenticated reads, i.e. rules are active). Result: every read/write fails; data lives only in the browser's `localStorage` mirror. |
| Loading after login | `onAuthStateChanged` | ❌ likely hang | `handleFirestoreError` re-throws errors as a JSON string; `App` re-throws anything starting with `{"error":` from inside the listener, which skips both the offline fallback and `setAuthLoading(false)` → the "Verileriniz yükleniyor…" spinner never ends when Firestore fails (which, per the line above, is always). |
| First-login document creation | `setDoc(initial…)` when doc missing | ⚠️ data-loss risk | Once sync is fixed, a user whose real data is only in `localStorage` would get an empty cloud doc that then overwrites the local mirror. Must migrate the local backup first. |
| AI Workout Planner | WorkoutPlanner → `generateWorkoutPlan` (gemini-2.5-flash JSON) + N× `gemini-2.5-flash-image` | ⚠️ | Image model calls are sequentially parallel per exercise (cost/latency, not on free tier); fallback placeholder `via.placeholder.com` is a dead service. Saving copies exercise *names* into the Workout Log category. |
| Workout Log | WorkoutLog → `setLogs` → Firestore doc `logs` | ✅ local / ❌ sync | Category → exercises → sets (weight/reps/type). Add/edit/delete sets and exercises, warm-up generator, search. **No dates / history** — it is a per-muscle-group notebook, not a dated log. Categories created by AI chat (free text) may not match `MUSCLE_GROUPS`, so they are only visible in Profile. |
| Calorie Calculator | form → `calculateCalories` → markdown text | ⚠️ | The LLM does the arithmetic; results are non-deterministic and unavailable offline. No input range validation. |
| Body Fat Calculator | profile values → `calculateBodyFat` → text | ⚠️ | The prompt asks the LLM to apply the US Navy formula; numbers are not computed in code. |
| AI Meal Analyzer | file input (`capture="environment"`) → base64 → `analyzeMealImage` / `analyzeMealFromText` | ⚠️ | No image resizing (full-resolution phone photos, often 3–8 MB base64); response fields assumed numeric (`.toFixed` crashes on `null`). |
| AI Buddy chat | `ai.chats.create` (client) + streaming | ⚠️ | Model markdown rendered with `dangerouslySetInnerHTML` **without sanitisation** (prompt-injection → XSS). `marked` loaded from esm.sh at runtime (fails offline / if CDN changes). Fixed-height layout `calc(100vh-280px)` breaks with the on-screen keyboard. |
| Water Tracker | buttons/custom/photo → `waterData.log[YYYY-MM-DD]` | ⚠️ | Date key uses `toISOString()` (UTC): in Türkiye (UTC+3) water drunk 00:00–03:00 is booked to the previous day. "Today" is memoised once and never rolls over while the app stays open. |
| Water reminders | `setInterval` + `new Notification()` | ❌ on Android | Web Notifications do not exist in Android WebView; also only fire while the tab is open. Uses `alert()`. |
| Charts | Recharts `ResponsiveContainer` (30-day line) + CSS weekly bars + SVG pie | ✅ | Fits narrow widths (width 100%), no horizontal overflow found. |

## 5. Mobile compatibility issues

1. **Runtime CDN dependencies** — Tailwind (cdn.tailwindcss.com), Inter (Google
   Fonts) and `marked` (esm.sh) are fetched at runtime. In an APK this means an
   unstyled app when offline or when a CDN changes. Must be bundled at build time.
2. `signInWithPopup` (Google) does not work in a WebView.
3. Web Notifications API unavailable → native local notifications needed.
4. `alert()` dialogs — replace with in-app messages.
5. `<input type=file capture>` works in Capacitor's WebView but returns full-size
   images; native camera with resize is better for upload size.
6. Layout: header + wrapping 8-button top nav (icons only on phones); no
   safe-area handling; chat height tied to `100vh`.
7. External links (`target="_blank"` YouTube) need to open in the system browser.
8. No Android back-button handling (would exit the app from any tab).

## 6. Security findings

| # | Severity | Finding | Evidence |
|---|---|---|---|
| S1 | **Critical** | Gemini API key compiled into the JS bundle. `vite.config.ts` `define`s `process.env.API_KEY = env.GEMINI_API_KEY`; `geminiService.ts` builds `new GoogleGenAI({apiKey})` in the browser. | **Verified**: building with `GEMINI_API_KEY=CANARY_KEY_123` puts `CANARY_KEY_123` in `dist/assets/index-*.js`. Anyone can extract and abuse the key (quota/billing). |
| S2 | High | Unauthenticated AI usage: planner, chat, meal analyzer and calculators call Gemini without login. | Code. |
| S3 | High | XSS via unsanitised model markdown in chat. | `NutritionTips.tsx` `dangerouslySetInnerHTML={marked.parse(...)}`. |
| S4 | Medium | `handleFirestoreError` logs the user's e-mail, uid and provider data to the console as JSON. | `services/firebase.ts`. |
| S5 | Medium | `.env` is **not** in `.gitignore` (only `*.local`). A developer following the README (`.env` with `GEMINI_API_KEY`) could commit the key. | `.gitignore`. |
| S6 | Info | Firebase web config (`firebase-applet-config.json`) is tracked. This is a public client identifier, not a secret; access control comes from Security Rules. | — |
| S7 | Low | `firestore.rules`: owner-only read/write on `users/{uid}` — correct ownership check, no other collections reachable. No schema/size validation. A `testConnection()` reads `test/connection`, which rules deny (harmless, but noisy). | File + probe (403 for unauthenticated read). |
| S8 | Unknown | Whether the rules in this file are the ones deployed on the named database, and whether the API key has API/app restrictions, cannot be checked without console access. | — |

## 7. Backend / Firebase requirements

* Firebase project `gen-lang-client-0975287872`, named Firestore database
  `ai-studio-remixgymbuddyaif-6e5a3d3a-d4cf-4d06-9291-985e69cfe7a4` (exists).
* Collection `users/{uid}` with fields `profile`, `logs`, `waterData`
  (see `firebase-blueprint.json`); schema kept as is.
* No Cloud Functions, no Storage usage, no other backend in the repository.
* The Gemini key must move server-side. The owner chose a free non-Firebase host
  (no Blaze billing) → see `MOBILE_ARCHITECTURE.md`.

## 8. Technical debt

* All state in `App.tsx`; side effects mixed into render (`setActiveTab` during render for PROFILE).
* Duplicate `toBase64`, `Input`, `Label`, `Select` helpers in several files.
* JSON "repair" regexes in `cleanAndParseJson` that can corrupt valid JSON.
* AI responses are cast to types without validation.
* No tests, lint or CI.
* Turkish-only UI strings hard-coded (acceptable for the beta).

## 9. Recommended migration strategy

Keep the React/Vite code and package it with **Capacitor** (details and the
alternatives considered in `MOBILE_ARCHITECTURE.md`):

1. Fix sync (named database), the loading hang and the local-backup migration.
2. Move all Gemini prompts to a small authenticated proxy; client sends task + inputs with a Firebase ID token.
3. Bundle Tailwind/fonts/marked; sanitise chat HTML.
4. Compute calories (Mifflin-St Jeor) and body fat (US Navy) in code; keep AI for advice text.
5. Local-date keys + day rollover for water; native local notifications.
6. Mobile shell: bottom navigation, safe areas, back button, status bar, keyboard-aware chat.
7. Native camera with resizing; system browser for external links.
8. Tests (calculators, parsers, proxy, Firestore rules), CI building the APK.

## 10. Concrete task list

- [x] Back up unpushed local work (`archive/supabase-migration`, local only)
- [ ] Fix `initializeFirestore` databaseId and persistence
- [ ] Rewrite load/save flow (no hang, migrate local backup, no PII logging)
- [ ] Gemini proxy (Cloudflare Worker) + client service
- [ ] Deterministic calculators + tests
- [ ] Bundle Tailwind, Inter, marked, DOMPurify
- [ ] Capacitor Android project, icons, splash, status bar
- [ ] Mobile navigation + back button + safe areas
- [ ] Camera, local notifications, network status, haptics
- [ ] Firestore rules hardening + emulator tests
- [ ] CI workflow, docs, PR, pre-release
