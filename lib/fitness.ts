// Deterministic fitness formulas. Previously these numbers were produced by the
// LLM from a prompt; they are now computed in code so they are reproducible,
// testable and available offline. The AI is only used for advice text.

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';

/** Standard Harris-Benedict/FAO activity multipliers applied to BMR. */
export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
};

/** Daily calorie adjustment per goal (kcal). */
export const GOAL_ADJUSTMENT: Record<Goal, number> = {
    lose: -500,
    maintain: 0,
    gain: 300,
};

export const MIN_TARGET_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };

export interface CalorieInput {
    age: number;
    sex: Sex;
    weightKg: number;
    heightCm: number;
    activityLevel: ActivityLevel;
    goal: Goal;
}

export interface MacroSplit {
    proteinG: number;
    fatG: number;
    carbsG: number;
    proteinKcal: number;
    fatKcal: number;
    carbsKcal: number;
}

export interface CalorieResult {
    bmr: number;
    tdee: number;
    targetKcal: number;
    macros: MacroSplit;
}

export class ValidationError extends Error {}

const inRange = (value: number, min: number, max: number, label: string) => {
    if (!Number.isFinite(value) || value < min || value > max) {
        throw new ValidationError(`${label} ${min}–${max} aralığında olmalıdır.`);
    }
};

export function validateCalorieInput(input: CalorieInput): void {
    inRange(input.age, 13, 100, 'Yaş');
    inRange(input.weightKg, 30, 300, 'Kilo (kg)');
    inRange(input.heightCm, 120, 250, 'Boy (cm)');
    if (!(input.activityLevel in ACTIVITY_MULTIPLIERS)) throw new ValidationError('Geçersiz aktivite seviyesi.');
    if (!(input.goal in GOAL_ADJUSTMENT)) throw new ValidationError('Geçersiz hedef.');
    if (input.sex !== 'male' && input.sex !== 'female') throw new ValidationError('Geçersiz cinsiyet.');
}

/** Mifflin-St Jeor BMR (kcal/day). */
export function mifflinStJeorBmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    return sex === 'male' ? base + 5 : base - 161;
}

/**
 * Macro split: protein 2.0 g/kg when cutting or bulking, 1.6 g/kg when
 * maintaining; fat 25 % of calories; carbohydrates fill the remainder.
 */
export function macroSplit(targetKcal: number, weightKg: number, goal: Goal): MacroSplit {
    const proteinPerKg = goal === 'maintain' ? 1.6 : 2.0;
    const proteinG = Math.round(weightKg * proteinPerKg);
    const proteinKcal = proteinG * 4;
    const fatKcal = Math.round(targetKcal * 0.25);
    const fatG = Math.round(fatKcal / 9);
    const carbsKcal = Math.max(0, targetKcal - proteinKcal - fatG * 9);
    const carbsG = Math.round(carbsKcal / 4);
    return { proteinG, fatG, carbsG, proteinKcal, fatKcal: fatG * 9, carbsKcal: carbsG * 4 };
}

export function calculateCalories(input: CalorieInput): CalorieResult {
    validateCalorieInput(input);
    const bmr = mifflinStJeorBmr(input.sex, input.weightKg, input.heightCm, input.age);
    const tdee = bmr * ACTIVITY_MULTIPLIERS[input.activityLevel];
    const targetKcal = Math.max(MIN_TARGET_KCAL[input.sex], Math.round(tdee + GOAL_ADJUSTMENT[input.goal]));
    return {
        bmr: Math.round(bmr),
        tdee: Math.round(tdee),
        targetKcal,
        macros: macroSplit(targetKcal, input.weightKg, input.goal),
    };
}

export interface BodyFatInput {
    sex: Sex;
    heightCm: number;
    neckCm: number;
    waistCm: number;
    hipCm?: number;
}

export function validateBodyFatInput(input: BodyFatInput): void {
    inRange(input.heightCm, 120, 250, 'Boy (cm)');
    inRange(input.neckCm, 20, 70, 'Boyun (cm)');
    inRange(input.waistCm, 40, 200, 'Bel (cm)');
    if (input.sex === 'female') {
        inRange(input.hipCm ?? NaN, 50, 200, 'Kalça (cm)');
        if (input.waistCm + (input.hipCm as number) - input.neckCm <= 0) {
            throw new ValidationError('Bel + kalça, boyundan büyük olmalıdır.');
        }
    } else if (input.waistCm - input.neckCm <= 0) {
        throw new ValidationError('Bel çevresi boyun çevresinden büyük olmalıdır.');
    }
}

/** U.S. Navy circumference method (metric form, centimetres). Returns body-fat %. */
export function navyBodyFatPercent(input: BodyFatInput): number {
    validateBodyFatInput(input);
    const { sex, heightCm, neckCm, waistCm } = input;
    const value =
        sex === 'male'
            ? 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450
            : 495 /
                  (1.29579 - 0.35004 * Math.log10(waistCm + (input.hipCm as number) - neckCm) + 0.221 * Math.log10(heightCm)) -
              450;
    return Math.round(value * 10) / 10;
}

export type BodyFatCategory = 'essential' | 'athletes' | 'fitness' | 'average' | 'obese';

export const BODY_FAT_CATEGORY_LABELS: Record<BodyFatCategory, string> = {
    essential: 'Temel Yağ',
    athletes: 'Atletik',
    fitness: 'Fitness',
    average: 'Ortalama',
    obese: 'Obez',
};

/** American Council on Exercise (ACE) body-fat categories. */
export function bodyFatCategory(sex: Sex, percent: number): BodyFatCategory {
    const limits = sex === 'male' ? [6, 14, 18, 25] : [14, 21, 25, 32];
    if (percent < limits[0]) return 'essential';
    if (percent < limits[1]) return 'athletes';
    if (percent < limits[2]) return 'fitness';
    if (percent < limits[3]) return 'average';
    return 'obese';
}
