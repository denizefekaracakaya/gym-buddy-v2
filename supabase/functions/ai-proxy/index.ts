// Supabase Edge Function entry point (Deno).
// Deployed with verify_jwt = false because the handler authenticates the user
// itself (and must answer CORS preflight requests, which carry no token).
import { handle, type Env } from './handler.ts';
import { verifySupabaseUser } from './auth.ts';
import { RateLimiter } from './rateLimit.ts';

declare const Deno: { env: { get(name: string): string | undefined }; serve(h: (req: Request) => Promise<Response>): void };

const env: Env = {
    // trimmed: a pasted key with a trailing newline/space is rejected by Google with HTTP 400
    GEMINI_API_KEY: (Deno.env.get('GEMINI_API_KEY') ?? '').trim(),
    SUPABASE_URL: Deno.env.get('SUPABASE_URL') ?? '',
    SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    ALLOWED_ORIGINS: Deno.env.get('ALLOWED_ORIGINS'),
    GEMINI_TEXT_MODEL: Deno.env.get('GEMINI_TEXT_MODEL'),
    GEMINI_IMAGE_MODEL: Deno.env.get('GEMINI_IMAGE_MODEL'),
};

const limiter = new RateLimiter(Number(Deno.env.get('RATE_PER_MINUTE') || 10), Number(Deno.env.get('RATE_PER_DAY') || 200));

Deno.serve(async (request) => {
    try {
        return await handle(request, env, {
            fetch: (input, init) => fetch(input, init),
            verifyToken: verifySupabaseUser,
            limiter,
            now: () => Date.now(),
            log: (entry) => console.log(JSON.stringify(entry)),
        });
    } catch (e) {
        console.log(JSON.stringify({ status: 'unhandled', error: e instanceof Error ? e.name : 'unknown' }));
        return new Response(JSON.stringify({ error: { code: 'internal', message: 'Sunucu hatası.' } }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
});
