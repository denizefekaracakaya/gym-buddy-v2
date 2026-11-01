# Gym Buddy — AI Fitness & Nutrition Assistant

A fitness and nutrition assistant for **Android** and the **web**. Plan workouts,
log exercises, calculate calories and body fat, analyse meals, chat with an AI coach
and track water intake — with your data synced per user via Supabase.

Built with **React 19**, **Vite**, **TypeScript**, **Tailwind CSS** and
**Capacitor 8** (Android).

## Features

- **AI Workout Planner** — personalised plans by muscle group, equipment, frequency and duration
- **Workout Log** — exercises per muscle group with working / warm-up / bodyweight / drop sets, warm-up generator
- **Calorie Calculator** — BMR/TDEE (Mifflin-St Jeor) and macros computed on the device, plus AI advice
- **Body Fat Calculator** — U.S. Navy method computed on the device, ACE category, plus AI advice
- **Meal Analyzer** — nutrition estimate from a photo (camera/gallery) or a description
- **AI Buddy Chat** — fitness and nutrition coaching with nutrition/exercise cards; save suggested programs to the log
- **Water Tracker** — daily goal, streaks, weekly and 30-day charts, AI photo estimate, reminders (native notifications on Android)
- **Profile & sync** — Supabase Auth + Postgres (row-level security), offline changes uploaded when back online

## Install the Android beta

Download the APK from the [Releases page](https://github.com/denizefekaracakaya/gym-buddy-v2/releases)
(pre-releases), open it on your phone and allow "Install unknown apps" for your
browser/file manager when Android asks. Requires Android 7.0 (API 24) or newer.
See the release notes for the signing type and known issues.

## Architecture

```
React app (Vite) ──► Capacitor 8 Android shell
   │                     camera · notifications · haptics · back button · status bar
   ├─► Supabase Auth + Postgres  (public.user_data: profile, logs, water_data; RLS)
   └─► Supabase Edge Function ai-proxy ──► Google Gemini
         verifies the user session · validates input · rate-limits · holds the API key
```

The Gemini API key is **never** shipped in the app. Details:
[docs/MOBILE_ARCHITECTURE.md](docs/MOBILE_ARCHITECTURE.md).

## Development

Requirements: Node.js ≥ 22.12, JDK 21, Android SDK 36 (for Android builds).

```bash
npm ci
cp .env.example .env.local   # optional overrides
npm run dev                  # http://localhost:3000
```

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production web build (`dist/`) |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (Vitest) |
| `npm run verify:bundle` | Scan `dist/` for secrets / dev URLs |
| `npm run android:sync` | Build + copy web assets into `android/` |
| `npm run android:open` | Open the Android project in Android Studio |
| `npm run proxy:deploy` | Deploy the `ai-proxy` Supabase Edge Function |

Full setup (Supabase, AI function, signing, CI, releases):
[docs/MOBILE_SETUP.md](docs/MOBILE_SETUP.md).

## Project structure

```
gym-buddy-v2/
├── App.tsx                  # App shell, auth/data flow, mobile navigation, lifecycle
├── components/              # Feature screens (+ shared/)
├── lib/                     # Pure logic: fitness formulas, dates, AI parsing, markdown sanitiser
├── services/
│   ├── supabase.ts          # Supabase client, auth error messages, deep-link URL
│   ├── userData.ts / userSync.ts  # Load/save user_data row, local backup, offline queue
│   ├── geminiService.ts     # Client for the AI edge function
│   └── native.ts            # Capacitor wrappers (camera, notifications, haptics, links)
├── supabase/                # migrations/ (schema + RLS), functions/ai-proxy (Gemini proxy)
├── android/                 # Capacitor Android project
├── tests/                   # Vitest unit tests
└── docs/                    # Audit, architecture, setup, release report
```

## Documentation

- [Mobile migration audit](docs/MOBILE_MIGRATION_AUDIT.md)
- [Architecture decision](docs/MOBILE_ARCHITECTURE.md)
- [Setup, build, CI and release](docs/MOBILE_SETUP.md)
- [Beta release report](docs/BETA_RELEASE_REPORT.md)
