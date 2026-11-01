import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_SUPABASE_URL = 'https://ksxjmzesbwaijiocwbwx.supabase.co';

/**
 * Production Content-Security-Policy. Only bundled code may run; network
 * access is limited to the Supabase project (auth, database, AI edge function).
 * (Not applied in dev, where Vite injects inline scripts.)
 */
function cspPlugin(urls: string[]): Plugin {
    const origins = new Set<string>();
    for (const u of urls.filter(Boolean)) {
        let origin: string;
        try {
            origin = new URL(u).origin;
        } catch {
            throw new Error(`Invalid URL in build configuration: ${u}`);
        }
        if (!origin.startsWith('https://')) throw new Error(`${u} must use https:// in production builds.`);
        origins.add(origin);
        origins.add(origin.replace('https://', 'wss://'));
    }
    const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        `connect-src 'self' ${[...origins].join(' ')}`,
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; ');
    return {
        name: 'gym-buddy-csp',
        apply: 'build',
        transformIndexHtml: (html) =>
            html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', 'VITE_');
    return {
        server: {
            port: 3000,
            host: '0.0.0.0',
        },
        plugins: [react(), cspPlugin([env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL, env.VITE_AI_PROXY_URL || ''])],
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
                        supabase: ['@supabase/supabase-js'],
                        recharts: ['recharts'],
                    },
                },
            },
        },
    };
});
