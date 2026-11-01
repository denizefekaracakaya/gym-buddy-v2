// Cloudflare Worker entry point.
import { handle, type Env } from './handler';
import { verifyFirebaseIdToken } from './auth';
import { RateLimiter } from './rateLimit';

let limiter: RateLimiter | undefined;

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        limiter ??= new RateLimiter(Number(env.RATE_PER_MINUTE || 10), Number(env.RATE_PER_DAY || 200));
        try {
            return await handle(request, env, {
                fetch: (input, init) => fetch(input, init),
                verifyToken: verifyFirebaseIdToken,
                limiter,
                now: () => Date.now(),
                log: (entry) => console.log(JSON.stringify(entry)),
            });
        } catch (e) {
            console.log(JSON.stringify({ status: 'unhandled', error: e instanceof Error ? e.name : 'unknown' }));
            return new Response(JSON.stringify({ error: { code: 'internal', message: 'Sunucu hatası.' } }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    },
};
