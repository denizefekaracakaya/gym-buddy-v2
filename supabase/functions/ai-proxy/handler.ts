// Gemini proxy request handler (Web-standard Request/Response; runs as a
// Supabase Edge Function and in Node tests). Flow:
//   CORS → method → size limit → Supabase user token → rate limit →
//   task validation → Gemini → response shaping.

import { TASKS, InputError, type GeminiRequest } from './tasks.ts';
import { AuthError, type TokenVerifier } from './auth.ts';
import { RateLimiter } from './rateLimit.ts';

export interface Env {
    GEMINI_API_KEY: string;
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    /** Comma-separated list of allowed browser origins. */
    ALLOWED_ORIGINS?: string;
    GEMINI_TEXT_MODEL?: string;
    GEMINI_IMAGE_MODEL?: string;
    /** Requests per user per minute / per day (per isolate). */
    RATE_PER_MINUTE?: string;
    RATE_PER_DAY?: string;
}

export interface Deps {
    fetch: typeof fetch;
    verifyToken: TokenVerifier;
    limiter: RateLimiter;
    now: () => number;
    log: (entry: Record<string, unknown>) => void;
}

export const MAX_BODY_BYTES = 8 * 1024 * 1024;
// Tried in order; on 404 (retired / not available for the key), 429, 5xx or a
// timeout the next model is used. GEMINI_TEXT_MODEL / GEMINI_IMAGE_MODEL
// (function secrets) are tried first when set.
// Measured 2026-11-01 with the project key: gemini-2.5-flash → 404,
// gemini-3.8-flash / gemini-flash-latest → >40 s timeouts, gemini-3.6-flash
// (thinking "low") ≈ 1.7 s, gemini-3.5-flash-lite ≈ 0.8 s.
export interface ModelChoice {
    name: string;
    thinkingLevel?: 'low' | 'high';
}
export const TEXT_MODELS: ModelChoice[] = [{ name: 'gemini-3.6-flash', thinkingLevel: 'low' }, { name: 'gemini-3.5-flash-lite' }];
export const IMAGE_MODELS: ModelChoice[] = [
    { name: 'gemini-nano-banana-2.1' },
    { name: 'gemini-3.1-flash-image' },
    { name: 'gemini-3.1-flash-lite-image' },
];
const RETRYABLE = new Set([404, 429, 500, 502, 503, 504]);
const GEMINI_TIMEOUT_MS = 40_000;

const DEFAULT_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost', 'http://localhost:3000'];

function corsHeaders(req: Request, env: Env): Record<string, string> {
    const origin = req.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()) : DEFAULT_ORIGINS;
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
    if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    return headers;
}

function json(status: number, body: unknown, extra: Record<string, string>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
    });
}

const err = (status: number, code: string, message: string, cors: Record<string, string>) =>
    json(status, { error: { code, message } }, cors);

async function callGemini(deps: Deps, env: Env, g: GeminiRequest) {
    const configured = g.model === 'image' ? env.GEMINI_IMAGE_MODEL : env.GEMINI_TEXT_MODEL;
    const defaults = g.model === 'image' ? IMAGE_MODELS : TEXT_MODELS;
    const candidates: ModelChoice[] = [
        ...(configured ? [{ name: configured }] : []),
        ...defaults.filter((m) => m.name !== configured),
    ];
    let last: { upstreamStatus: number; reason: string; model: string } | null = null;
    for (const choice of candidates) {
        const model = choice.name;
        const generationConfig: Record<string, unknown> = { ...(g.generationConfig ?? {}) };
        if (choice.thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel: choice.thinkingLevel };
        const body: Record<string, unknown> = { contents: g.contents };
        if (g.systemInstruction) body.systemInstruction = { parts: [{ text: g.systemInstruction }] };
        if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
        let res: Response;
        try {
            res = await deps.fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
                },
            );
        } catch (e) {
            const name = e instanceof Error ? e.name : '';
            if (name !== 'TimeoutError' && name !== 'AbortError') throw e;
            last = { upstreamStatus: 504, reason: 'TIMEOUT', model };
            deps.log({ status: 'model_fallback', model, reason: 'TIMEOUT' });
            continue;
        }
        if (!res.ok) {
            // Only Google's machine-readable status/reason is kept (e.g. API_KEY_INVALID,
            // NOT_FOUND) — never the request content.
            let reason = '';
            try {
                const e = (await res.json()) as { error?: { status?: string; details?: { reason?: string }[] } };
                reason = [e.error?.status, e.error?.details?.find((d) => d.reason)?.reason].filter(Boolean).join('/');
            } catch {
                // ignore
            }
            last = { upstreamStatus: res.status as number, reason, model };
            if (RETRYABLE.has(res.status)) {
                deps.log({ status: 'model_fallback', model, upstream: res.status, reason });
                continue;
            }
            return last;
        }
        const data = (await res.json()) as {
            candidates?: { content?: { parts?: { text?: string; thought?: boolean; inlineData?: { mimeType: string; data: string } }[] } }[];
        };
        const parts = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought);
        const text = parts.map((p) => p.text ?? '').join('');
        const img = parts.find((p) => p.inlineData?.data)?.inlineData;
        return { text, model, inlineImage: img ? { mimeType: img.mimeType, data: img.data } : undefined };
    }
    return last ?? { upstreamStatus: 404, reason: 'NO_MODEL', model: '' };
}

export async function handle(req: Request, env: Env, deps: Deps): Promise<Response> {
    const cors = corsHeaders(req, env);
    const url = new URL(req.url);
    const started = deps.now();

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method === 'GET' && url.pathname.endsWith('/health')) return json(200, { ok: true, configured: !!env.GEMINI_API_KEY }, cors);
    if (req.method !== 'POST') return err(405, 'method_not_allowed', 'Yalnızca POST.', cors);
    if (!env.GEMINI_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        return err(503, 'not_configured', 'Yapay zeka servisi yapılandırılmamış.', cors);
    }

    const declared = Number(req.headers.get('Content-Length') || '0');
    if (declared > MAX_BODY_BYTES) return err(413, 'too_large', 'İstek çok büyük.', cors);

    // --- authentication ---
    const authz = req.headers.get('Authorization') || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
    if (!token) return err(401, 'auth_required', 'Bu özelliği kullanmak için giriş yapın.', cors);
    let uid: string;
    try {
        uid = await deps.verifyToken(token, env);
    } catch (e) {
        if (e instanceof AuthError) return err(401, 'auth_invalid', 'Oturum doğrulanamadı. Lütfen tekrar giriş yapın.', cors);
        return err(503, 'auth_unavailable', 'Kimlik doğrulama servisine ulaşılamadı. Lütfen tekrar deneyin.', cors);
    }

    // --- rate limit ---
    const limit = deps.limiter.take(uid, deps.now());
    if (!limit.ok) {
        return err(429, 'rate_limited', 'Çok fazla istek gönderildi. Lütfen biraz bekleyin.', {
            ...cors,
            'Retry-After': String(limit.retryAfterSec),
        });
    }

    // --- body + task ---
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return err(413, 'too_large', 'İstek çok büyük.', cors);
    let body: { task?: unknown; input?: unknown };
    try {
        body = JSON.parse(raw);
    } catch {
        return err(400, 'bad_json', 'Geçersiz istek.', cors);
    }
    const taskName = typeof body.task === 'string' ? body.task : '';
    const task = Object.prototype.hasOwnProperty.call(TASKS, taskName) ? TASKS[taskName] : undefined;
    if (!task) return err(400, 'unknown_task', 'Bilinmeyen işlem.', cors);
    if (!body.input || typeof body.input !== 'object' || Array.isArray(body.input)) {
        return err(400, 'bad_input', 'Geçersiz istek.', cors);
    }

    let geminiReq: GeminiRequest;
    try {
        geminiReq = task.build(body.input as Record<string, unknown>);
    } catch (e) {
        if (e instanceof InputError) return err(400, 'bad_input', e.message, cors);
        throw e;
    }

    // Logs never contain user content, e-mail or the uid.
    const logBase = { task: taskName };
    try {
        const reply = await callGemini(deps, env, geminiReq);
        if ('upstreamStatus' in reply) {
            deps.log({
                ...logBase,
                status: 'upstream_error',
                upstream: reply.upstreamStatus,
                reason: reply.reason,
                model: reply.model,
                ms: deps.now() - started,
            });
            if (reply.upstreamStatus === 504) {
                return err(504, 'ai_timeout', 'Yapay zeka yanıt vermedi. Lütfen tekrar deneyin.', cors);
            }
            if (reply.upstreamStatus === 429) {
                return err(429, 'ai_quota', 'Yapay zeka servisi şu an yoğun. Lütfen daha sonra tekrar deneyin.', cors);
            }
            return err(502, 'ai_error', 'Yapay zeka servisine ulaşılamadı.', cors);
        }
        const result = task.shape(reply);
        deps.log({ ...logBase, status: 'ok', model: reply.model, ms: deps.now() - started });
        return json(200, { result }, cors);
    } catch (e) {
        const name = e instanceof Error ? e.name : 'unknown';
        deps.log({ ...logBase, status: 'failed', error: name, ms: deps.now() - started });
        if (name === 'TimeoutError' || name === 'AbortError') {
            return err(504, 'ai_timeout', 'Yapay zeka yanıt vermedi. Lütfen tekrar deneyin.', cors);
        }
        const message = e instanceof Error && e.message ? e.message : 'Yanıt işlenemedi.';
        return err(502, 'ai_bad_response', message.slice(0, 200), cors);
    }
}

