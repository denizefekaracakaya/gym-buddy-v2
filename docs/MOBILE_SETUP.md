# Gym Buddy — Development, Build and Release Setup

## Requirements

| Tool | Version |
|---|---|
| Node.js | ≥ 22.12 (CI uses 22) |
| JDK | 21 (Gradle and the Firestore emulator; make sure `java -version` on PATH is 21) |
| Android SDK | platform 36, build-tools 36.0.0 (Android Studio Otter or newer) |
| Cloudflare account | free plan, for the AI proxy |

## Install and run (web)

```bash
npm ci
cp .env.example .env.local     # set VITE_AI_PROXY_URL (optional)
npm run dev                    # http://localhost:3000
```

`.env*` files are git-ignored. **Only `VITE_*` values reach the app and they are
public.** The Gemini key must never be placed in any `.env` used by Vite.

## Environment variables

| Name | Where | Secret? | Purpose |
|---|---|---|---|
| `VITE_AI_PROXY_URL` | `.env.local` / GitHub repo **variable** `AI_PROXY_URL` | no | Base URL of the Worker, e.g. `https://gym-buddy-ai-proxy.<subdomain>.workers.dev`. Empty → app builds with AI features disabled (UI says so). |
| `GEMINI_API_KEY` | Cloudflare Worker **secret** | **yes** | Google AI Studio key. Only on the server. |
| `FIREBASE_PROJECT_ID`, `ALLOWED_ORIGINS`, `GEMINI_TEXT_MODEL`, `GEMINI_IMAGE_MODEL`, `RATE_PER_MINUTE`, `RATE_PER_DAY` | `server/ai-proxy/wrangler.toml` `[vars]` | no | Proxy configuration |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | GitHub Actions **secrets** | **yes** | Release signing (optional; see below) |

## Firebase

* Project `gen-lang-client-0975287872`, Firestore database
  `ai-studio-remixgymbuddyaif-6e5a3d3a-d4cf-4d06-9291-985e69cfe7a4` (named DB),
  config in `firebase-applet-config.json` (public client config).
* **Authentication providers — action required by the owner:** at audit time
  *Email/Password is disabled* (`PASSWORD_LOGIN_DISABLED`) and only Google is
  enabled. Google sign-in is a browser popup and is not available in the Android
  app, so on Android nobody can sign in until **Firebase console → Authentication →
  Sign-in method → Email/Password → Enable** is switched on. No app change is needed
  after enabling it.
* Security rules: `firestore.rules`; `firebase.json` targets the named database.
  Deploy (owner, after review): `npx firebase-tools deploy --only firestore:rules`.
  The new rules only accept the three fields the app writes
  (`profile`, `logs`, `waterData`); see `tests/rules/`.

## AI proxy (Cloudflare Worker)

```bash
npx wrangler@4 login                                    # once, opens the browser
npx wrangler@4 secret put GEMINI_API_KEY --config server/ai-proxy/wrangler.toml
npm run proxy:deploy                                    # prints the workers.dev URL
curl https://<url>/health                               # {"ok":true}
```

Then set the GitHub repository variable `AI_PROXY_URL` (Settings → Secrets and
variables → Actions → Variables) and/or `VITE_AI_PROXY_URL` in `.env.local`, and
rebuild the app. The CSP in the production build automatically allows that origin.

Recommended: in Google Cloud console set a quota / budget alert on the Gemini key,
and rotate the key that was previously compiled into the web bundle (it must be
considered leaked).

Local proxy: `npm run proxy:dev` (needs a `.dev.vars` file in `server/ai-proxy/`
with `GEMINI_API_KEY=...`; it is git-ignored via `.env*`/`.wrangler` rules — do not commit it).

## Tests

```bash
npm run typecheck
npm test               # unit tests: formulas, dates, data migration, AI parsing, sanitiser, proxy handler
npm run test:rules     # Firestore rules in the emulator (needs JDK 21 on PATH)
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

1. **test** — `npm ci` (lockfile), typecheck, unit tests, rules tests (emulator),
   production build with `vars.AI_PROXY_URL`, bundle secret scan.
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
