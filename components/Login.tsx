
import React, { useState } from 'react';
import Card from './shared/Card';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from '../services/firebase';

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (mode === 'register') {
                if (password !== confirmPassword) {
                    setError('Şifreler eşleşmiyor.');
                    setIsLoading(false);
                    return;
                }
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                if (userCredential.user) {
                    onLoginSuccess(userCredential.user.email || userCredential.user.uid);
                }
            } else { // mode === 'login'
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                if (userCredential.user) {
                    onLoginSuccess(userCredential.user.email || userCredential.user.uid);
                }
            }
        } catch (err: any) {
            console.error("Auth error:", err);
            let errMsg = 'Bir hata oluştu. Lütfen bilgilerinizi kontrol edip tekrar deneyin.';
            if (err.code === 'auth/email-already-in-use') {
                errMsg = 'Bu e-posta adresi zaten kullanımda.';
            } else if (err.code === 'auth/weak-password') {
                errMsg = 'Şifre çok zayıf (en az 6 karakter olmalıdır).';
            } else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                errMsg = 'Geçersiz e-posta veya şifre.';
            } else if (err.code === 'auth/invalid-email') {
                errMsg = 'Geçersiz bir e-posta adresi girdiniz.';
            }
            setError(errMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError('');
        setIsLoading(true);
        try {
            const result = await signInWithPopup(auth, googleProvider);
            if (result.user) {
                onLoginSuccess(result.user.email || result.user.uid);
            }
        } catch (err: any) {
            console.error("Google Sign-In Error:", err);
            if (err.code === 'auth/popup-blocked') {
                setError('Google giriş penceresi engellendi. Lütfen tarayıcı ayarlarından pop-up engellemesini kaldırın veya e-posta ile giriş yapın.');
            } else if (err.code === 'auth/popup-closed-by-user') {
                setError('Giriş işlemi kullanıcı tarafından iptal edildi.');
            } else {
                setError('Google ile giriş yapılamadı. Alternatif olarak e-posta ile giriş yapabilirsiniz.');
            }
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

                {/* Google Sign-In Button */}
                <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-800 font-semibold py-2.5 px-4 rounded-lg border border-slate-200 transition-colors duration-300 shadow-sm mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
                        />
                        <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                    </svg>
                    Google ile Giriş Yap
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className="flex-1 h-[1px] bg-slate-800"></div>
                    <span className="text-xs text-slate-500 font-medium">veya e-posta ile</span>
                    <div className="flex-1 h-[1px] bg-slate-800"></div>
                </div>

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

                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-500 disabled:bg-blue-400/50 disabled:cursor-not-allowed transition-colors duration-300"
                    >
                        {isLoading ? 'İşleniyor...' : (isLogin ? 'Giriş Yap' : 'Kayıt Ol')}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button onClick={() => { setMode(isLogin ? 'register' : 'login'); setError(''); }} className="text-sm text-blue-400 hover:underline">
                        {isLogin ? 'Hesabınız yok mu? Kayıt Olun.' : 'Zaten bir hesabınız var mı? Giriş Yapın.'}
                    </button>
                </div>
            </Card>
        </div>
    );
};

export default Login;

