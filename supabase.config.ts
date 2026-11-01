// Public Supabase client configuration.
// The publishable key is designed to be shipped in apps; data access is
// enforced by Row Level Security in the database (supabase/migrations).
// Override with VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY if needed.
export const SUPABASE_PROJECT_REF = 'ksxjmzesbwaijiocwbwx';
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || `https://${SUPABASE_PROJECT_REF}.supabase.co`;
export const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_PGBNr3rpx6gCDdhS5q-e3g_7pgsFUVs';
