// Parsing and validation of Gemini responses. Shared by the AI proxy (server)
// and the app (chat cards). Every AI response is treated as untrusted input:
// values are coerced to the expected shape and anything else is dropped.

import type { AiCardData, NutritionInfo, ParsedWorkout, VitaminMineral, WaterEstimation } from '../types.ts';

export class AiParseError extends Error {}

/** Extracts the first JSON value from a model reply (handles ``` fences and leading prose). */
export function extractJson(text: string): unknown {
    let s = (text || '').trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence) s = fence[1].trim();
    try {
        return JSON.parse(s);
    } catch {
        // Fall back to the outermost {...} or [...] block.
        const starts = [s.indexOf('{'), s.indexOf('[')].filter((i) => i >= 0);
        if (starts.length === 0) throw new AiParseError('Yapay zekadan gelen yanıt işlenemedi.');
        const start = Math.min(...starts);
        const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
        if (end <= start) throw new AiParseError('Yapay zekadan gelen yanıt işlenemedi.');
        try {
            return JSON.parse(s.slice(start, end + 1));
        } catch {
            throw new AiParseError('Yapay zekadan gelen yanıt işlenemedi.');
        }
    }
}

const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Accepts numbers and numeric strings like "12.5" or "12,5 g"; returns 0 otherwise. Never negative. */
export const num = (v: unknown): number => {
    let n = NaN;
    if (typeof v === 'number') n = v;
    else if (typeof v === 'string') n = parseFloat(v.replace(',', '.').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function toNutritionInfo(raw: unknown): NutritionInfo {
    if (!isObj(raw)) throw new AiParseError('Besin analizi yanıtı geçersiz.');
    const vitamins: VitaminMineral[] = Array.isArray(raw.vitaminsAndMinerals)
        ? raw.vitaminsAndMinerals
              .filter(isObj)
              .map((v) => ({ name: str(v.name, 60), amount: num(v.amount), unit: str(v.unit, 10) }))
              .filter((v) => v.name)
              .slice(0, 20)
        : [];
    return {
        mealName: str(raw.mealName, 120),
        description: str(raw.description, 500),
        calories: num(raw.calories),
        protein: num(raw.protein),
        carbohydrates: num(raw.carbohydrates),
        fat: num(raw.fat),
        fiber: num(raw.fiber),
        vitaminsAndMinerals: vitamins,
    };
}

export interface PlannedExercise {
    name: string;
    description: string;
    keyPoints: string[];
    imagePromptEn: string;
}

export function toPlannedExercises(raw: unknown): PlannedExercise[] {
    const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.exercises) ? raw.exercises : null;
    if (!list) throw new AiParseError('Antrenman planı yanıtı geçersiz.');
    const out = list
        .filter(isObj)
        .map((ex) => ({
            name: str(ex.name, 120),
            description: str(ex.description, 1500),
            keyPoints: Array.isArray(ex.keyPoints) ? ex.keyPoints.map((p) => str(p, 300)).filter(Boolean).slice(0, 6) : [],
            imagePromptEn: str(ex.imagePromptEn, 500),
        }))
        .filter((ex) => ex.name)
        .slice(0, 12);
    if (out.length === 0) throw new AiParseError('Antrenman planı oluşturulamadı.');
    return out;
}

export function toParsedWorkout(raw: unknown): ParsedWorkout | null {
    if (!isObj(raw) || !Array.isArray(raw.exercises)) return null;
    const category = str(raw.category, 60);
    const exercises = raw.exercises
        .filter(isObj)
        .map((ex) => ({
            name: str(ex.name, 120),
            sets: Array.isArray(ex.sets)
                ? ex.sets
                      .filter(isObj)
                      .map((s) => ({ weight: str(String(s.weight ?? ''), 10), reps: str(String(s.reps ?? ''), 10) }))
                      .slice(0, 20)
                : [],
        }))
        .filter((ex) => ex.name)
        .slice(0, 30);
    if (!category || exercises.length === 0) return null;
    return { category, exercises };
}

export function toWaterEstimation(raw: unknown): WaterEstimation {
    if (!isObj(raw)) throw new AiParseError('Su tahmini yanıtı geçersiz.');
    const confidence = raw.confidence === 'high' || raw.confidence === 'low' ? raw.confidence : 'medium';
    return {
        estimatedVolume: Math.min(5000, Math.round(num(raw.estimatedVolume))),
        confidence,
        reasoning: str(raw.reasoning, 500),
    };
}

/** Splits a chat reply into display text and an optional ':::DATA {...} :::' card. */
export function parseChatCard(text: string): { cleanText: string; cardData: AiCardData | null } {
    let cleanText = text;
    let cardData: AiCardData | null = null;
    const match = text.match(/:::DATA([\s\S]*?):::/);
    if (match) {
        cleanText = text.replace(match[0], '');
        try {
            const raw = extractJson(match[1]);
            if (isObj(raw) && raw.type === 'nutrition') {
                cardData = {
                    type: 'nutrition',
                    title: str(raw.title, 120),
                    calories: num(raw.calories),
                    protein: num(raw.protein),
                    carbs: num(raw.carbs),
                    fat: num(raw.fat),
                };
            } else if (isObj(raw) && raw.type === 'exercise') {
                const d = raw.difficulty;
                cardData = {
                    type: 'exercise',
                    title: str(raw.title, 120),
                    difficulty: d === 'Easy' || d === 'Hard' ? d : 'Medium',
                    muscleGroup: str(raw.muscleGroup, 60),
                    equipment: str(raw.equipment, 60),
                };
            }
        } catch {
            cardData = null;
        }
    }
    cleanText = cleanText.replace('[PROGRAM_KAYDEDILEBILIR]', '').trim();
    return { cleanText, cardData };
}
