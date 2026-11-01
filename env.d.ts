/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Base URL of the Gym Buddy AI proxy (Cloudflare Worker), e.g. https://gym-buddy-ai-proxy.<account>.workers.dev */
    readonly VITE_AI_PROXY_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
