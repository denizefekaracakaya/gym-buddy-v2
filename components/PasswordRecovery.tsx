import React, { useState } from 'react';
import Card from './shared/Card';
import { auth, authErrorMessage } from '../services/supabase';

/** Shown after the user opens a password-reset link: sets a new password. */
const PasswordRecovery: React.FC<{ onDone: (message: string) => void }> = ({ onDone }) => {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password.length < 6) return setError('Şifre en az 6 karakter olmalıdır.');
        if (password !== confirm) return setError('Şifreler eşleşmiyor.');
        setBusy(true);
        const { error: err } = await auth.updateUser({ password });
        setBusy(false);
        if (err) setError(authErrorMessage(err));
        else onDone('Şifreniz güncellendi.');
    };

    const input = 'w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500';
    return (
        <div className="animate-fade-in max-w-md mx-auto">
            <Card>
                <h2 className="text-2xl font-bold text-white mb-2">Yeni Şifre Belirle</h2>
                <form onSubmit={submit} className="space-y-4 mt-4">
                    <input type="password" autoComplete="new-password" placeholder="Yeni şifre" value={password} onChange={(e) => setPassword(e.target.value)} className={input} required />
                    <input type="password" autoComplete="new-password" placeholder="Yeni şifre (tekrar)" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} required />
                    {error && <p className="text-red-400 text-sm text-center" role="alert">{error}</p>}
                    <button type="submit" disabled={busy} className="w-full min-h-[48px] bg-blue-600 text-white font-bold rounded-lg disabled:opacity-50">
                        {busy ? 'Kaydediliyor...' : 'Şifreyi Güncelle'}
                    </button>
                </form>
            </Card>
        </div>
    );
};

export default PasswordRecovery;
