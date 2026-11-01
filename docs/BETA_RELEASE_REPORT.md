# Gym Buddy v0.1.0-beta.1 — Beta Release Report

Date: 2026-11-01

| Item | Value |
|---|---|
| Release | https://github.com/denizefekaracakaya/gym-buddy-v2/releases/tag/v0.1.0-beta.1 (pre-release) |
| Tag / commit | `v0.1.0-beta.1` → `e00c9f6f1efbd393853ecd863e75c6dfcc2d4cea` |
| Branch / PR | `feat/android-mobile`, https://github.com/denizefekaracakaya/gym-buddy-v2/pull/1 (not merged) |
| CI | `Android build` run 41336224898: tests ✔, APK/AAB ✔, pre-release ✔ |
| APK | `GymBuddy-0.1.0-beta.1-debug-signed.apk`, 8,278,944 bytes |
| APK SHA-256 | `853b287fe53e1ad45db7414723701dc65155d47e0b9952233e6137d568fd1e24` |
| AAB | `GymBuddy-0.1.0-beta.1-debug-signed.aab`, 7,387,975 bytes, SHA-256 `87d445df20056102f3403c891492e43929aee7f7fb99d18db420487f35ab2676` |
| Package / version | `io.github.denizefekaracakaya.gymbuddy`, versionName `0.1.0-beta.1`, versionCode 7, minSdk 24, targetSdk 36 |
| Signing | **Debug key of the CI runner** (CN=Android Debug, cert SHA-256 `f936834c…0c622`); owner chose debug signing for this beta |
| Backend | Supabase project `gym-buddy-ai` (`ksxjmzesbwaijiocwbwx`): Auth, `public.user_data` (RLS), Edge Function `ai-proxy` v6 |

## Artifact verification (done after downloading the release assets)

* `sha256sum -c SHA256SUMS.txt` → APK OK, AAB OK
* `aapt2 dump badging`: package ID, version, SDK levels as above; not debuggable;
  permissions INTERNET, ACCESS_NETWORK_STATE, POST_NOTIFICATIONS,
  RECEIVE_BOOT_COMPLETED, WAKE_LOCK, VIBRATE (no camera/storage/location/exact alarm)
* `apksigner verify` → valid v2+ signature, debug certificate
* All 71 `assets/public/*` files were extracted; `verify-bundle.mjs` scanned the 13 text
  files: no Google/Gemini key, no Supabase secret or service-role key, no dev URLs,
  no runtime CDN code. CSP `connect-src` allows only the Supabase origin.
* Post-release fix: the CI APK scan only covered top-level files, because unzip
  wildcards do not cross `/`. It now extracts the whole APK (branch, after the tag). The
  released artifact was checked manually with the full scan above.

## Tests

| Test | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test`: 56 unit tests (formulas, dates/streaks, data decision and offline queue, AI parsing, sanitiser, edge-function handler incl. auth, validation, rate limit, model fallback) | 56/56 pass |
| Production build + bundle secret scan | pass |
| RLS (SQL, impersonating a user, rolled back): own insert OK; other users' rows invisible, not updatable or deletable | pass |
| REST as a real user: anonymous read denied (401); writing another user's row denied (403); non-object `logs` rejected by a check constraint; `updated_at` trigger | pass |
| Edge function live: all 9 tasks. Text tasks, meal photo and water photo succeed with `gemini-3.6-flash`. `exerciseImage` returns 429 (no image quota on the key) and the app shows a placeholder | 8/9 |

### Android emulator (Android 16, x86_64, 1080×2400) — local release build of the same app code

Covered by an earlier pass on the Firebase-era build (these screens were not changed by the
Supabase switch; login, sync and reminders were retested below): navigation and "Daha" sheet, back button, background/resume, offline banner,
calorie calculator values checked by hand, water tracker and charts, camera capture,
gallery picker (system photo picker, no permission), notification permission denial
message.

Supabase build:

| Step | Result |
|---|---|
| Login with e-mail/password | ✔ profile loaded from the cloud |
| Add water → cloud row updated | ✔ (400 ml visible via REST) |
| Airplane mode: add water → cloud unchanged; back online → uploaded automatically | ✔ (400 → 600 ml) |
| Force-stop and relaunch → still logged in, data present | ✔ |
| Enable reminders → system permission → alarms scheduled | ✔ after fixing a dead-end "Alarms & reminders" screen (inexact alarms) |
| AI Buddy chat in the app (markdown + nutrition card) | ✔ |
| Notification actually delivered | not observed (first one was due in 60 min) |
| Physical device | **not tested** |
| Released CI artifact installed on emulator | not done: the emulator was stopped by the system for low memory; artifact verified statically (above) |

## Issues found and fixed during the beta work

1. Firebase cloud sync never worked: wrong database ID argument → replaced by Supabase.
2. Infinite loading spinner when Firestore failed.
3. Gemini API key compiled into the web bundle → server-side Edge Function.
4. Unsanitised chat HTML (XSS).
5. Water log used UTC dates; "today" never rolled over.
6. Firebase Email/Password provider disabled → Supabase e-mail auth.
7. `gemini-2.5-flash` returns 404 and `gemini-3.8-flash` times out → measured
   models with fallback.
8. The LocalNotifications plugin forced the exact-alarm settings screen → inexact alarms.
9. The CI APK scan missed nested bundles → whole-APK extraction.

## Known limitations

See the release notes: exercise illustrations (image quota), debug signing (uninstall
between betas), redirect URL configuration for e-mail links, no Google sign-in,
inexact reminders, the free Supabase plan auto-pauses, Turkish-only UI, last-write-wins sync.

## Owner follow-ups

* Delete the QA account `denizefekaracakaya14+gbqa@gmail.com` (Authentication → Users).
  Deleting it also removes its `user_data` row. The deletion was approved, but the
  confirmation prompt expired before anyone could answer it.
* Delete the retired `ai-diag` Edge Function (it now only returns 410).
* Supabase Auth: add the redirect URL `io.github.denizefekaracakaya.gymbuddy://auth-callback`,
  set the Site URL, and enable leaked-password protection if your plan includes it.
* Set a budget or quota alert on the Gemini key. Enable billing if exercise illustrations are wanted.
* Before Play Store: create a release keystore and add the 4 signing secrets (`docs/MOBILE_SETUP.md`).
* Review and merge PR #1.

## iOS

Not started. Requires macOS + Xcode: `npx cap add ios`, camera/photo usage strings,
notification permission text, Apple signing, deep-link URL scheme.
