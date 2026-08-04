# Gym Buddy — AI Fitness & Nutrition Assistant

A web-based fitness and nutrition assistant powered by Google Gemini AI. Plan workouts,
log exercises, analyze meals, and track water intake — with your data persisted per-user
via Firebase.

Built with **React 19**, **Vite**, and **TypeScript**.

## Features

- **AI Workout Planner** — personalized workout plans tailored to your profile
- **Workout Log** — log and review exercises over time
- **Calorie Calculator** — AI-assisted calorie recommendations
- **Body Fat Calculator** — body-composition estimates
- **Meal Analyzer** — AI nutrition insights from a meal description or photo
- **AI Buddy Chat** — nutrition tips and coaching via Gemini
- **Water Tracker** — daily hydration goals with reminders
- **User Profiles** — Firebase Auth + Firestore sync, so data follows the user

## Tech Stack

| Layer    | Tech                                                        |
|----------|-------------------------------------------------------------|
| Frontend | React 19, TypeScript, Vite                                  |
| AI       | Google Gemini AI (`@google/genai`)                          |
| Backend  | Firebase Authentication + Cloud Firestore                   |
| Charts   | Recharts                                                    |

## Getting Started

### Prerequisites

- Node.js 18+
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/)
- A Firebase project with **Authentication** and **Firestore** enabled

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root with your Gemini key:

   ```bash
   GEMINI_API_KEY=your_gemini_api_key
   ```

   The key is injected at build time via `vite.config.ts` and read by
   `services/geminiService.ts`.

3. Put your Firebase project configuration into `services/firebase.ts`.

4. Run the dev server:

   ```bash
   npm run dev
   ```

   The app is served at <http://localhost:3000>.

## Scripts

| Command            | Description                  |
|--------------------|------------------------------|
| `npm run dev`      | Start the Vite dev server    |
| `npm run build`    | Produce a production build   |
| `npm run preview`  | Preview the production build |

## Project Structure

```
gym-buddy-v2/
├── App.tsx                 # App shell + navigation
├── components/             # Feature components
│   ├── WorkoutPlanner.tsx
│   ├── WorkoutLog.tsx
│   ├── CalorieCalculator.tsx
│   ├── BodyFatCalculator.tsx
│   ├── MealAnalyzer.tsx
│   ├── NutritionTips.tsx   # AI buddy chat
│   ├── WaterTracker.tsx
│   ├── Profile.tsx
│   └── shared/
├── services/
│   ├── firebase.ts         # Auth + Firestore wiring
│   └── geminiService.ts    # Gemini calls + JSON parsing
├── constants.tsx
└── types.ts
```