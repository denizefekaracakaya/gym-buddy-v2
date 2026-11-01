// Verifies the caller's Supabase access token by asking Supabase Auth who the
// user is (works with both legacy HS256 and asymmetric signing keys, and
// rejects the anon/publishable key, which is not a user session).

export class AuthError extends Error {}

export type TokenVerifier = (token: string, env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string }) => Promise<string>;

export const verifySupabaseUser: TokenVerifier = async (token, env) => {
    let res: Response;
    try {
        res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
            headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10_000),
        });
    } catch {
        throw new Error('auth service unreachable');
    }
    if (res.status === 401 || res.status === 403) throw new AuthError('invalid token');
    if (!res.ok) throw new Error(`auth service error ${res.status}`);
    const user = (await res.json()) as { id?: unknown; role?: unknown };
    if (typeof user.id !== 'string' || !user.id || user.role !== 'authenticated') throw new AuthError('not a user session');
    return user.id;
};
