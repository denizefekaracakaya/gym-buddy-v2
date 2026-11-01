// Client side of the AI features. The Gemini API key is NOT in the app: every
// request goes to the `ai-proxy` Supabase Edge Function
// (supabase/functions/ai-proxy), which holds the key, verifies the user's
// session, validates the input and builds the prompt.

import { auth } from './supabase';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../supabase.config';
import type { ChatMessage, Exercise, NutritionInfo, ParsedWorkout, WaterEstimation } from '../types';
import type { ActivityLevel, Goal, Sex } from '../lib/fitness';

export const AI_PROXY_URL = (import.meta.env.VITE_AI_PROXY_URL || `${SUPABASE_URL}/functions/v1/ai-proxy`).replace(/\/+$/, '');
/** Builds can opt out with VITE_AI_DISABLED=true. */
export const aiConfigured = import.meta.env.VITE_AI_DISABLED !== 'true';

export type AiErrorCode =
    | 'not_configured'
    | 'auth_required'
    | 'offline'
    | 'rate_limited'
    | 'bad_input'
    | 'server';

export class AiError extends Error {
    constructor(
        public code: AiErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'AiError';
    }
}

const MESSAGES: Record<AiErrorCode, string> = {
    not_configured: 'Yapay zeka servisi bu sürümde henüz etkin değil.',
    auth_required: 'Yapay zeka özelliklerini kullanmak için giriş yapın.',
    offline: 'İnternet bağlantısı yok. Lütfen bağlantınızı kontrol edin.',
    rate_limited: 'Çok fazla istek gönderildi. Lütfen biraz bekleyip tekrar deneyin.',
    bad_input: 'Girilen bilgiler geçersiz.',
    server: 'Yapay zeka servisine ulaşılamadı. Lütfen daha sonra tekrar deneyin.',
};

const REQUEST_TIMEOUT_MS = 90_000;

async function callAi<T>(task: string, input: Record<string, unknown>): Promise<T> {
    if (!aiConfigured) throw new AiError('not_configured', MESSAGES.not_configured);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiError('offline', MESSAGES.offline);
    // getSession() refreshes an expired access token when needed.
    const { data } = await auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new AiError('auth_required', MESSAGES.auth_required);

    let res: Response;
    try {
        res = await fetch(AI_PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY },
            body: JSON.stringify({ task, input }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (e) {
        const name = e instanceof Error ? e.name : '';
        if (name === 'TimeoutError') throw new AiError('server', 'Yapay zeka yanıt vermedi. Lütfen tekrar deneyin.');
        throw new AiError('offline', MESSAGES.offline);
    }

    let payload: { result?: T; error?: { code?: string; message?: string } } = {};
    try {
        payload = await res.json();
    } catch {
        // fall through with empty payload
    }
    if (res.ok && payload.result !== undefined) return payload.result;

    const serverMsg = payload.error?.message;
    if (res.status === 401) throw new AiError('auth_required', serverMsg || MESSAGES.auth_required);
    if (res.status === 429) throw new AiError('rate_limited', serverMsg || MESSAGES.rate_limited);
    if (res.status === 400) throw new AiError('bad_input', serverMsg || MESSAGES.bad_input);
    if (res.status === 503) throw new AiError('not_configured', MESSAGES.not_configured);
    throw new AiError('server', serverMsg || MESSAGES.server);
}

export const getErrorMessage = (error: unknown): string => {
    if (error instanceof AiError) return error.message;
    if (error instanceof Error && error.message) return error.message;
    return 'Bilinmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.';
};

// ---------- tasks ----------

export const generateWorkoutPlan = async (
    muscleGroup: string,
    equipment: string,
    frequency: string,
    duration: string,
): Promise<Exercise[]> => {
    const { exercises } = await callAi<{ exercises: Exercise[] }>('workoutPlan', {
        muscleGroup,
        equipment,
        frequency,
        duration,
    });
    return exercises;
};

/** Optional illustration for a planned exercise. Returns a data: URL. */
export const generateExerciseImage = async (prompt: string): Promise<string> => {
    const img = await callAi<{ mimeType: string; data: string }>('exerciseImage', { prompt });
    return `data:${img.mimeType};base64,${img.data}`;
};

export interface CalorieAdviceInput {
    age: number;
    gender: Sex;
    weight: number;
    height: number;
    activityLevel: ActivityLevel;
    goal: Goal;
}

export const getCalorieAdvice = async (input: CalorieAdviceInput): Promise<string> =>
    (await callAi<{ text: string }>('calorieAdvice', { ...input })).text;

export const getBodyFatAdvice = async (input: {
    gender: Sex;
    height: number;
    neck: number;
    waist: number;
    hip?: number;
}): Promise<string> => (await callAi<{ text: string }>('bodyFatAdvice', { ...input })).text;

export const analyzeMealImage = (base64Image: string, mimeType: string): Promise<NutritionInfo> =>
    callAi<NutritionInfo>('mealImage', { image: { mimeType, data: base64Image } });

export const analyzeMealFromText = (description: string, weight?: string): Promise<NutritionInfo> =>
    callAi<NutritionInfo>('mealText', { description, weight: weight || undefined });

export const parseWorkoutFromText = async (text: string): Promise<ParsedWorkout | null> =>
    (await callAi<{ workout: ParsedWorkout | null }>('parseWorkout', { text })).workout;

export const estimateWaterVolumeFromImage = (base64Image: string, mimeType: string): Promise<WaterEstimation> =>
    callAi<WaterEstimation>('waterImage', { image: { mimeType, data: base64Image } });

/** Max number of messages sent as context (the proxy accepts up to 30). */
export const CHAT_CONTEXT_MESSAGES = 20;

export const sendChatMessage = async (history: ChatMessage[], userName?: string): Promise<string> => {
    const messages = history.slice(-CHAT_CONTEXT_MESSAGES).map((m) => ({ role: m.role, text: m.text.slice(0, 4000) }));
    return (await callAi<{ text: string }>('chat', { messages, userName })).text;
};
