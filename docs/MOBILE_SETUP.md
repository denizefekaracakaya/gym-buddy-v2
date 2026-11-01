# Gym Buddy — Development, Build and Release Setup

## Requirements

| Tool | Version |
|---|---|
| Node.js | ≥ 22.12 (CI uses 22) |
| JDK | 21 (Gradle; make sure `java -version` on PATH is 21) |
| Android SDK | platform 36, build-tools 36.0.0 (Android Studio Otter or newer) |
| Supabase | project `gym-buddy-ai` (`ksxjmzesbwaijiocwbwx`), free plan |

## Install and run (web)

```bash
npm ci
cp .env.example .env.local     # optional overrides; defaults point to the Supabase project
npm run dev                    # http://localhost:3000
```

`.env*` files are git-ignored. **Only `VITE_*` values reach the app and they are
public.** The Gemini key must never be placed in any `.env` used by Vite.

## Configuration

| Name | Where | Secret? | Purpose |
|---|---|---|---|
| Supabase URL + publishable key | `supabase.config.ts` (override: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) | no | Client access; protected by RLS |
| `VITE_AI_DISABLED` | build env | no | `true` builds without AI features |
| `GEMINI_API_KEY` | Supabase → Edge Functions → **Secrets** | **yes** | Google AI Studio key, server only |
| `GEMINI_TEXT_MODEL`, `GEMINI_IMAGE_MODEL`, `RATE_PER_MINUTE`, `RATE_PER_DAY`, `ALLOWED_ORIGINS` | Edge Function secrets (optional) | no | Model / limit overrides |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | GitHub Actions secrets | **yes** | Release signing (optional) |

Never use the Supabase `service_role` / `sb_secret_…` key in the app; the bundle
scan (`npm run verify:bundle`) fails the build if one appears.

## Supabase

1. **Database:** apply `supabase/migrations/*.sql` (SQL editor, or
   `npx supabase@2 db push --project-ref ksxjmzesbwaijiocwbwx`). The table
   `public.user_data` already exists; the migration hardens it (owner-only RLS
   for `authenticated`, no `anon` access, JSON object + size checks, `updated_at`
   trigger). Existing rows are kept.
2. **Auth:** Authentication → Providers → Email enabled (default). Under
   Authentication → URL Configuration add the redirect URL
   `io.github.denizefekaracakaya.gymbuddy://auth-callback` so confirmation and
   password-reset e-mails open the app. (Without it, links fall back to the Site
   URL: the e-mail is still confirmed, the user then logs in manually; password
   reset needs the redirect URL.) The default Supabase e-mail sender is
   rate-limited (a few e-mails per hour) — configure custom SMTP before a wider beta.
3. **AI function:**
   ```bash
   npx supabase@2 login
   npm run proxy:deploy        # = supabase functions deploy ai-proxy --no-verify-jwt
   ```
   then Dashboard → Edge Functions → Secrets → add `GEMINI_API_KEY`.
   Health check: `GET https://ksxjmzesbwaijiocwbwx.supabase.co/functions/v1/ai-proxy/health`
   → `{"ok":true,"configured":true}`.
   `verify_jwt` is off on purpose (CORS preflight); the function itself rejects
   requests without a logged-in user's token.
4. Free-plan projects are **paused after ~7 days without activity**; the app then
   cannot log in or sync until the project is restored in the dashboard.

Recommended: set a quota / budget alert on the Gemini key in Google Cloud and
rotate the key that used to be compiled into the web bundle.

## Tests

```bash
npm run typecheck
npm test               # unit tests: formulas, dates, data sync logic, AI parsing, sanitiser, edge function
npm run build && npm run verify:bundle   # production build + secret/dev-URL scan
```

## Android

```bash
npm run android:sync          # vite build + cap sync android
npm run android:open          # Android Studio
# or command line (JDK 21, ANDROID_HOME set):
cd android && ./gradlew assembleRelease bundleRelease
# → android/app/build/outputs/apk/release/app-release.apk
#   android/app/build/outputs/bundle/release/app-release.aab
```

Icons/splash are generated from `scripts/generate-brand-assets.mjs`:
`npm run android:assets`.

### Signing

* Without the signing secrets, the **release build type** (not debuggable,
  WebView debugging off) is signed with the **debug key** of the machine that built
  it. This is fine for testing but: on CI the debug key changes on every run, so a
  newer beta cannot be installed over an older one (uninstall first, which deletes
  local data — cloud data is kept). Google Play will not accept it.
* For stable signing, create a keystore once and keep it safe (losing it means you
  can never update the app under the same signature):

  ```bash
  keytool -genkeypair -v -keystore gym-buddy-release.jks -alias gymbuddy \
          -keyalg RSA -keysize 4096 -validity 10000
  base64 -w0 gym-buddy-release.jks   # → secret ANDROID_KEYSTORE_BASE64
  ```

  Add `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD` as repository secrets. CI then signs with it automatically
  (artifact names change from `-debug-signed` to `-release-signed`). Never commit the
  keystore (`*.jks`, `*.keystore` are git-ignored).

## CI/CD (`.github/workflows/android-build.yml`)

Triggers: PRs to `main`, pushes to `feat/android-mobile`, tags `v*-beta.*`, manual.

1. **test** — `npm ci` (lockfile), typecheck, unit tests, production build,
   bundle secret scan.
2. **android** — `cap sync`, Gradle `assembleRelease bundleRelease`, then verifies the
   APK (signature, package id, versionName, not debuggable, secret scan of the
   packaged web assets), computes SHA-256, uploads APK/AAB/checksums + Gradle log.
3. **release** (tags only) — checks the artifact was built from the tagged commit
   and creates/updates the GitHub **pre-release** with
   `docs/release-notes/<tag>.md`.

Any failing step blocks the release job.

## Beta release process

1. Merge-ready branch, CI green.
2. Write `docs/release-notes/vX.Y.Z-beta.N.md`, bump `package.json` version, commit.
3. `git tag vX.Y.Z-beta.N <commit> && git push origin vX.Y.Z-beta.N`.
4. CI builds, verifies and publishes the pre-release from that exact commit.

## iOS (future)

`npm i @capacitor/ios && npx cap add ios` on macOS with Xcode. Additional work:
camera/photo usage strings in `Info.plist`, notification permission text, Apple
signing, and (for Google sign-in) the native plugin.
