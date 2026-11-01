import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../supabase.config';

export const isNative = Capacitor.isNativePlatform();

/** Deep link that Supabase auth e-mails (confirm sign-up, reset password) send the user back to. */
export const AUTH_REDIRECT_URL = isNative
    ? 'io.github.denizefekaracakaya.gymbuddy://auth-callback'
    : typeof window !== 'undefined'
      ? window.location.origin
      : undefined;

// Session is persisted in localStorage (the Android WebView keeps it across
// restarts) and refreshed automatically. PKCE lets the app exchange the code
// from the e-mail deep link itself.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !isNative,
        flowType: 'pkce',
    },
});

export const auth = supabase.auth;

/** Turkish messages for Supabase auth errors (by error code, falling back to message text). */
export function authErrorMessage(err: unknown): string {
    const e = err as { code?: string; message?: string; status?: number; name?: string };
    const code = e?.code || '';
    const msg = (e?.message || '').toLowerCase();
    if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'Geçersiz e-posta veya şifre.';
    if (code === 'email_not_confirmed' || msg.includes('email not confirmed'))
        return 'E-posta adresiniz henüz onaylanmadı. Gelen kutunuzdaki onay bağlantısına tıklayın.';
    if (code === 'user_already_exists' || msg.includes('already registered')) return 'Bu e-posta adresi zaten kullanımda.';
    if (code === 'weak_password' || msg.includes('password should be')) return 'Şifre çok zayıf (en az 6 karakter olmalıdır).';
    if (code === 'email_address_invalid' || msg.includes('invalid format') || msg.includes('email address')) return 'Geçersiz bir e-posta adresi girdiniz.';
    if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || e?.status === 429)
        return 'Çok fazla deneme yapıldı. Lütfen bir süre sonra tekrar deneyin.';
    if (code === 'signup_disabled' || code === 'email_provider_disabled') return 'Yeni kayıtlar şu anda kapalı.';
    if (code === 'same_password') return 'Yeni şifre eskisinden farklı olmalıdır.';
    if (e?.name === 'AuthRetryableFetchError' || msg.includes('failed to fetch') || msg.includes('network'))
        return 'İnternet bağlantısı yok. Lütfen bağlantınızı kontrol edip tekrar deneyin.';
    return 'Bir hata oluştu. Lütfen bilgilerinizi kontrol edip tekrar deneyin.';
}
