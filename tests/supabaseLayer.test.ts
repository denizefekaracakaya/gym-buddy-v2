import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifySupabaseUser, AuthError } from '../supabase/functions/ai-proxy/auth.ts';
import { handle, type Env } from '../supabase/functions/ai-proxy/handler.ts';
import { RateLimiter } from '../supabase/functions/ai-proxy/rateLimit.ts';
import { decideInitialData, normalizeLogs } from '../services/userData';

const env = { SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_ANON_KEY: 'anon' };

afterEach(() => vi.unstubAllGlobals());

describe('verifySupabaseUser', () => {
    it('returns the user id for an authenticated session', async () => {
        const f = vi.fn(async () => new Response(JSON.stringify({ id: 'u-1', role: 'authenticated' }), { status: 200 }));
        vi.stubGlobal('fetch', f);
        await expect(verifySupabaseUser('tok', env)).resolves.toBe('u-1');
        const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://demo.supabase.co/auth/v1/user');
        expect(init.headers).toMatchObject({ apikey: 'anon', Authorization: 'Bearer tok' });
    });

    it('rejects invalid tokens and non-user (anon) sessions', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
        await expect(verifySupabaseUser('bad', env)).rejects.toBeInstanceOf(AuthError);
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'x', role: 'anon' }), { status: 200 })));
        await expect(verifySupabaseUser('anon-key', env)).rejects.toBeInstanceOf(AuthError);
    });

    it('handler returns 503 (not 401) when the auth service is unreachable', async () => {
        const res = await handle(
            new Request('https://p.test/functions/v1/ai-proxy', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: '{}' }),
            { ...env, GEMINI_API_KEY: 'k' } as Env,
            {
                fetch: vi.fn() as unknown as typeof fetch,
                verifyToken: async () => {
                    throw new Error('down');
                },
                limiter: new RateLimiter(10, 10),
                now: () => 0,
                log: () => undefined,
            },
        );
        expect(res.status).toBe(503);
    });
});

describe('Supabase user_data compatibility', () => {
    it('reads logs written by the earlier prototype ({v1, v2})', () => {
        const ex = [{ id: '1', name: 'Squat', sets: [] }];
        expect(normalizeLogs({ v1: { Bacak: ex }, v2: [] })).toEqual({ Bacak: ex });
        expect(normalizeLogs({ Bacak: ex, Göğüs: 'junk' })).toEqual({ Bacak: ex });
    });

    it('unsynced offline edits win over the cloud copy and are uploaded', () => {
        const local = { profile: { name: 'Offline edit' }, logs: {}, waterData: { goal: 2000, log: {} } };
        const d = decideInitialData({ reachable: true, exists: true, data: { profile: { name: 'Old' } } }, local, true);
        expect(d.source).toBe('local-unsynced');
        expect(d.data.profile.name).toBe('Offline edit');
        expect(d.writeToCloud?.profile.name).toBe('Offline edit');
    });
});
