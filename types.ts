





export enum NavigationTab {
  WORKOUTS = 'Egzersizler',
  WORKOUT_LOG = 'Not Defteri',
  WATER_TRACKER = 'Su Takibi',
  CALORIE_CALCULATOR = 'Kalori Hesaplayıcı',
  BODY_FAT_CALCULATOR = 'Vücut Yağı',
  AI_COACH = 'AI Buddy',
  MEAL_ANALYZER = 'Yemek Analizi',
  PROFILE = 'Profil',
  LOGIN = 'Giriş Yap',
}

export interface UserProfile {
    name?: string;
    age: string;
    weight: string;
    height: string;
    gender: 'male' | 'female' | 'other';
    neck?: string;
    waist?: string;
    hip?: string;
}

export interface Exercise {
  name: string;
  description: string;
  keyPoints: string[];
  imageUrl: string;
}

export interface CalorieFormData {
  age: string;
  gender: 'male' | 'female';
  weight: string;
  height: string;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'lose' | 'maintain' | 'gain';
}

export interface VitaminMineral {
    name: string;
    amount: number;
    unit: string;
}

export interface NutritionInfo {
    mealName: string;
    description: string;
    calories: number;
    protein: number;
    carbohydrates: number;
    fat: number;
    fiber: number;
    vitaminsAndMinerals: VitaminMineral[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface SetLog {
    weight: string;
    reps: string;
    type?: 'warmup' | 'working' | 'bodyweight' | 'drop';
}

export interface LoggedExercise {
    id: string;
    name: string;
    sets: SetLog[];
}

export interface ParsedWorkout {
    category: string;
    exercises: Omit<LoggedExercise, 'id'>[];
}

export interface WaterData {
  goal: number; // in ml
  log: Record<string, number>; // key: 'YYYY-MM-DD', value: ml
  reminderEnabled: boolean;
  reminderInterval: number; // in minutes
}

export interface WaterEstimation {
    estimatedVolume: number;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
}

// New Types for Chat Cards
export interface AiCardNutrition {
    type: 'nutrition';
    title: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

export interface AiCardExercise {
    type: 'exercise';
    title: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    muscleGroup: string;
    equipment: string;
}

export type AiCardData = AiCardNutrition | AiCardExercise;