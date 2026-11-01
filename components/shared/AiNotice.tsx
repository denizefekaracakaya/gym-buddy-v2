import React from 'react';
import { aiConfigured } from '../../services/geminiService';

interface AiNoticeProps {
    isLoggedIn: boolean;
    onLoginRedirect: () => void;
    className?: string;
}

/** Explains why an AI feature is unavailable. Renders nothing when AI can be used. */
export const aiAvailable = (isLoggedIn: boolean) => aiConfigured && isLoggedIn;

const AiNotice: React.FC<AiNoticeProps> = ({ isLoggedIn, onLoginRedirect, className = '' }) => {
    if (!aiConfigured) {
        return (
            <div className={`bg-slate-800/70 border border-slate-700 text-slate-300 p-4 rounded-lg text-sm ${className}`} role="status">
                <p className="font-semibold text-white">Yapay zeka özellikleri bu sürümde kapalı.</p>
                <p className="mt-1 text-slate-400">
                    Güvenlik nedeniyle yapay zeka istekleri artık bir sunucu üzerinden yapılıyor ve bu sunucu henüz etkinleştirilmedi.
                </p>
            </div>
        );
    }
    if (!isLoggedIn) {
        return (
            <div className={`bg-blue-900/30 border border-blue-800 text-blue-100 p-4 rounded-lg text-sm ${className}`} role="status">
                <p>Yapay zeka özelliklerini kullanmak için giriş yapın.</p>
                <button onClick={onLoginRedirect} className="mt-2 font-bold underline min-h-[44px]">
                    Giriş Yap / Kayıt Ol
                </button>
            </div>
        );
    }
    return null;
};

export default AiNotice;
