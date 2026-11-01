// Gemini proxy request handler (Web-standard Request/Response; runs on
// Cloudflare Workers and in tests). Flow:
//   CORS → method/path → size limit → Firebase ID token → rate limit →
//   task validation → Gemini → response shaping.

import { TASKS, InputError, type GeminiRequest } from './tasks';
import { verifyFirebaseIdToken, AuthError, type TokenVerifier } from './auth';
import { RateLimiter } from './rateLimit';

export interface Env {
    GEMINI_API_KEY: string;
    FIREBASE_PROJECT_ID: string;
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
const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash';
const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';
const GEMINI_TIMEOUT_MS = 60_000;

const DEFAULT_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost', 'http://localhost:3000'];

function corsHeaders(req: Request, env: Env): Record<string, string> {
    const origin = req.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()) : DEFAULT_ORIGINS;
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
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
    const model = g.model === 'image' ? env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL : env.GEMINI_TEXT_MODEL || DEFAULT_TEXT_MODEL;
    const body: Record<string, unknown> = { contents: g.contents };
    if (g.systemInstruction) body.systemInstruction = { parts: [{ text: g.systemInstruction }] };
    if (g.generationConfig) body.generationConfig = g.generationConfig;
    const res = await deps.fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        },
    );
    if (!res.ok) return { upstreamStatus: res.status as number };
    const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string; inlineData?: { mimeType: string; data: string } }[] } }[];
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? '').join('');
    const img = parts.find((p) => p.inlineData?.data)?.inlineData;
    return { text, inlineImage: img ? { mimeType: img.mimeType, data: img.data } : undefined };
}

export async function handle(req: Request, env: Env, deps: Deps): Promise<Response> {
    const cors = corsHeaders(req, env);
    const url = new URL(req.url);
    const started = deps.now();

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/health' && req.method === 'GET') return json(200, { ok: true }, cors);
    if (url.pathname !== '/v1/ai') return err(404, 'not_found', 'Bulunamadı.', cors);
    if (req.method !== 'POST') return err(405, 'method_not_allowed', 'Yalnızca POST.', cors);
    if (!env.GEMINI_API_KEY || !env.FIREBASE_PROJECT_ID) {
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
        uid = await deps.verifyToken(token, env.FIREBASE_PROJECT_ID);
    } catch (e) {
        if (e instanceof AuthError) return err(401, 'auth_invalid', 'Oturum doğrulanamadı. Lütfen tekrar giriş yapın.', cors);
        throw e;
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
            deps.log({ ...logBase, status: 'upstream_error', upstream: reply.upstreamStatus, ms: deps.now() - started });
            if (reply.upstreamStatus === 429) {
                return err(429, 'ai_quota', 'Yapay zeka servisi şu an yoğun. Lütfen daha sonra tekrar deneyin.', cors);
            }
            return err(502, 'ai_error', 'Yapay zeka servisine ulaşılamadı.', cors);
        }
        const result = task.shape(reply);
        deps.log({ ...logBase, status: 'ok', ms: deps.now() - started });
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

export { verifyFirebaseIdToken };
