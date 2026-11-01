import React, { useState } from 'react';
import Card from './shared/Card';
import { auth, authErrorMessage, AUTH_REDIRECT_URL } from '../services/supabase';

interface LoginProps {
    onLoginSuccess: (email: string) => void;
}

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input {...props} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
);

const Label: React.FC<{ htmlFor: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-300 mb-2">{children}</label>
);

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const handlePasswordReset = async () => {
        setError('');
        setInfo('');
        if (!email.trim()) {
            setError('Şifre sıfırlama bağlantısı için önce e-posta adresinizi girin.');
            return;
        }
        setIsLoading(true);
        const { error: err } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: AUTH_REDIRECT_URL });
        setIsLoading(false);
        // Unknown addresses are not revealed (no account enumeration); only show input/network/rate errors.
        if (err && (err.status === 429 || err.name === 'AuthRetryableFetchError' || err.code === 'email_address_invalid')) {
            setError(authErrorMessage(err));
            return;
        }
        setInfo('Bu adrese kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderildi. Bağlantıyı bu telefonda açın.');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setInfo('');
        if (mode === 'register' && password !== confirmPassword) {
            setError('Şifreler eşleşmiyor.');
            return;
        }
        setIsLoading(true);
        try {
            if (mode === 'register') {
                const { data, error: err } = await auth.signUp({
                    email: email.trim(),
                    password,
                    options: { emailRedirectTo: AUTH_REDIRECT_URL },
                });
                if (err) throw err;
                if (data.session && data.user) {
                    onLoginSuccess(data.user.email || data.user.id);
                } else {
                    // E-mail confirmation is required by the project settings.
                    setInfo('Kayıt alındı! E-posta adresinize gönderilen onay bağlantısına tıklayın, ardından giriş yapın.');
                    setMode('login');
                }
            } else {
                const { data, error: err } = await auth.signInWithPassword({ email: email.trim(), password });
                if (err) throw err;
                if (data.user) onLoginSuccess(data.user.email || data.user.id);
            }
        } catch (err) {
            console.warn('Auth error:', (err as { code?: string })?.code);
            setError(authErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    };

    const isLogin = mode === 'login';

    return (
        <div className="animate-fade-in max-w-md mx-auto">
            <Card>
                <h2 className="text-2xl font-bold text-white mb-2">{isLogin ? 'Giriş Yap' : 'Kayıt Ol'}</h2>
                <p className="text-slate-400 mb-6">
                    {isLogin ? 'Devam etmek için hesabınıza giriş yapın.' : 'Başlamak için yeni bir hesap oluşturun.'}
                </p>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <Label htmlFor="email">E-posta Adresi</Label>
                        <Input 
                            type="email" 
                            name="email" 
                            id="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)}
                            required 
                            autoComplete="email"
                            placeholder="ornek@mail.com"
                        />
                    </div>
                    <div>
                        <Label htmlFor="password">Şifre</Label>
                        <Input 
                            type="password" 
                            name="password" 
                            id="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete={isLogin ? "current-password" : "new-password"}
                            placeholder="••••••••"
                        />
                    </div>
                    {!isLogin && (
                        <div>
                            <Label htmlFor="confirmPassword">Şifreyi Onayla</Label>
                            <Input 
                                type="password" 
                                name="confirmPassword" 
                                id="confirmPassword" 
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                autoComplete="new-password"
                                placeholder="••••••••"
                            />
                        </div>
                    )}

                    {error && <p className="text-red-400 text-sm text-center" role="alert">{error}</p>}
                    {info && <p className="text-green-400 text-sm text-center" role="status">{info}</p>}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full min-h-[48px] bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-500 disabled:bg-blue-400/50 disabled:cursor-not-allowed transition-colors duration-300"
                    >
                        {isLoading ? 'İşleniyor...' : (isLogin ? 'Giriş Yap' : 'Kayıt Ol')}
                    </button>
                </form>

                <div className="mt-6 text-center space-y-2">
                    {isLogin && (
                        <button type="button" onClick={handlePasswordReset} disabled={isLoading} className="block mx-auto text-sm text-slate-400 hover:underline min-h-[44px]">
                            Şifremi unuttum
                        </button>
                    )}
                    <button onClick={() => { setMode(isLogin ? 'register' : 'login'); setError(''); setInfo(''); }} className="text-sm text-blue-400 hover:underline min-h-[44px]">
                        {isLogin ? 'Hesabınız yok mu? Kayıt Olun.' : 'Zaten bir hesabınız var mı? Giriş Yapın.'}
                    </button>
                </div>
            </Card>
        </div>
    );
};

export default Login;

