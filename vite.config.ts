import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Production Content-Security-Policy. Only bundled code may run; network
 * access is limited to Firebase/Google APIs and the AI proxy.
 * (Not applied in dev, where Vite injects inline scripts.)
 */
function cspPlugin(aiProxyUrl: string): Plugin {
    let proxyOrigin = '';
    try {
        proxyOrigin = aiProxyUrl ? new URL(aiProxyUrl).origin : '';
    } catch {
        throw new Error(`VITE_AI_PROXY_URL is not a valid URL: ${aiProxyUrl}`);
    }
    if (proxyOrigin && !proxyOrigin.startsWith('https://')) {
        throw new Error('VITE_AI_PROXY_URL must use https:// in production builds.');
    }
    const csp = [
        "default-src 'self'",
        // apis.google.com + firebaseapp.com frames: Google sign-in popup (web build only).
        "script-src 'self' https://apis.google.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        `connect-src 'self' https://*.googleapis.com ${proxyOrigin}`.trim(),
        "frame-src https://*.firebaseapp.com https://accounts.google.com",
        "object-src 'none'",
        "base-uri 'self'",
    ].join('; ');
    return {
        name: 'gym-buddy-csp',
        apply: 'build',
        transformIndexHtml: (html) =>
            html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', 'VITE_');
    return {
        server: {
            port: 3000,
            host: '0.0.0.0',
        },
        plugins: [react(), cspPlugin(env.VITE_AI_PROXY_URL || '')],
        // NOTE: no `define` of API keys. Nothing secret may be injected into the
        // client bundle; only VITE_* variables are exposed, and they are public.
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            },
        },
        build: {
            sourcemap: false,
            chunkSizeWarningLimit: 1200,
            rollupOptions: {
                output: {
                    manualChunks: {
                        firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
                        recharts: ['recharts'],
                    },
                },
            },
        },
    };
});
