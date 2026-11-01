/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Optional override of the Supabase project URL (default in supabase.config.ts). */
    readonly VITE_SUPABASE_URL?: string;
    /** Optional override of the Supabase publishable key (public). */
    readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
    /** Optional override of the AI proxy URL (default: <supabase>/functions/v1/ai-proxy). */
    readonly VITE_AI_PROXY_URL?: string;
    /** "true" builds the app with AI features disabled. */
    readonly VITE_AI_DISABLED?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
