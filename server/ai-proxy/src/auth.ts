// Firebase ID token verification without the Admin SDK (works on Workers).
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

import { createRemoteJWKSet, jwtVerify } from 'jose';

export class AuthError extends Error {}

export type TokenVerifier = (token: string, projectId: string) => Promise<string>;

const JWKS = createRemoteJWKSet(
    new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

/** Returns the Firebase uid, or throws AuthError. */
export const verifyFirebaseIdToken: TokenVerifier = async (token, projectId) => {
    try {
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: `https://securetoken.google.com/${projectId}`,
            audience: projectId,
            algorithms: ['RS256'],
        });
        if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) {
            throw new AuthError('invalid subject');
        }
        const authTime = (payload as { auth_time?: number }).auth_time;
        if (typeof authTime !== 'number' || authTime * 1000 > Date.now() + 60_000) {
            throw new AuthError('invalid auth_time');
        }
        return payload.sub;
    } catch (e) {
        if (e instanceof AuthError) throw e;
        throw new AuthError('invalid token');
    }
};
