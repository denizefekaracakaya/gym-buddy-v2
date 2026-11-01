import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { sendChatMessage, getErrorMessage } from '../services/geminiService';
import type { ChatMessage, UserProfile, AiCardData } from '../types';
import Card from './shared/Card';
import AiNotice, { aiAvailable } from './shared/AiNotice';
import { parseChatCard } from '../lib/aiParse';
import { renderSafeMarkdown } from '../lib/markdown';

interface AiBuddyChatProps {
    onSaveWorkout: (text: string) => Promise<void>;
    userProfile?: UserProfile;
    isLoggedIn: boolean;
    onLoginRedirect: () => void;
}

const RenderAiCard: React.FC<{ data: AiCardData }> = ({ data }) => {
    if (data.type === 'nutrition') {
        return (
            <div className="mt-3 mb-2 bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-lg w-full max-w-sm">
                <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 bg-green-500/20 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <h4 className="font-bold text-white text-lg">{data.title}</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-900/50 p-2 rounded-lg text-center">
                        <div className="text-2xl font-bold text-white">{data.calories}</div>
                        <div className="text-xs text-slate-400">kcal</div>
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Protein</span>
                            <span className="text-blue-400 font-medium">{data.protein}g</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Karb</span>
                            <span className="text-yellow-400 font-medium">{data.carbs}g</span>
                        </div>
                         <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Yağ</span>
                            <span className="text-red-400 font-medium">{data.fat}g</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (data.type === 'exercise') {
        return (
             <div className="mt-3 mb-2 bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-lg w-full max-w-sm">
                <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                             <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <h4 className="font-bold text-white text-lg">{data.title}</h4>
                </div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
                        <span className="text-slate-400 text-sm">Zorluk</span>
                        <span className={`text-xs font-bold px-2 py-1 rounded ${
                            data.difficulty === 'Easy' ? 'bg-green-500/20 text-green-400' :
                            data.difficulty === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                        }`}>{data.difficulty}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
                        <span className="text-slate-400 text-sm">Kas Grubu</span>
                        <span className="text-white text-sm font-medium">{data.muscleGroup}</span>
                    </div>
                     <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
                        <span className="text-slate-400 text-sm">Ekipman</span>
                        <span className="text-white text-sm font-medium">{data.equipment}</span>
                    </div>
                </div>
            </div>
        )
    }

    return null;
}

const AiBuddyChat: React.FC<AiBuddyChatProps> = ({ onSaveWorkout, userProfile, isLoggedIn, onLoginRedirect }) => {
    const userName = isLoggedIn && userProfile?.name ? userProfile.name.split(' ')[0] : undefined;
    const greeting: ChatMessage = useMemo(
        () => ({
            role: 'model',
            text: userName
                ? `Merhaba, ${userName}! Ben senin kişisel AI Buddy'n. Sana nasıl yardımcı olabilirim?`
                : `Merhaba! Ben senin kişisel AI Buddy'n. Sana özel antrenman veya beslenme programı oluşturabilirim. Ne yapmak istersin?`,
        }),
        [userName],
    );
    const [messages, setMessages] = useState<ChatMessage[]>([greeting]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [savingStates, setSavingStates] = useState<Record<number, 'idle' | 'saving' | 'saved' | 'error'>>({});
    const [saveErrors, setSaveErrors] = useState<Record<number, string>>({});
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const canUseAi = aiAvailable(isLoggedIn);

    // Reset the conversation when the user changes (login/logout).
    useEffect(() => {
        setMessages([greeting]);
    }, [greeting]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, isLoading]);

    const handleSendMessage = useCallback(
        async (e?: React.FormEvent) => {
            e?.preventDefault();
            const text = userInput.trim();
            if (!text || isLoading || !canUseAi) return;

            const lowerCaseText = text.toLocaleLowerCase('tr-TR');
            const withUser: ChatMessage[] = [...messages, { role: 'user', text }];
            setMessages(withUser);
            setUserInput('');

            if (lowerCaseText.includes('yağ oranım') || lowerCaseText.includes('vücut yağımı hesapla') || lowerCaseText.includes('vücut yağı')) {
                setMessages((prev) => [
                    ...prev,
                    {
                        role: 'model',
                        text: "Elbette! Vücut yağ oranını hesaplamak için menüdeki 'Vücut Yağı' bölümünü kullanabilirsin. Gerekli bilgileri profilinde doldurduğundan emin olmayı unutma!",
                    },
                ]);
                return;
            }

            setIsLoading(true);
            try {
                const reply = await sendChatMessage(withUser, userName);
                setMessages((prev) => [...prev, { role: 'model', text: reply || 'Yanıt alınamadı.' }]);
            } catch (error) {
                setMessages((prev) => [...prev, { role: 'model', text: getErrorMessage(error) }]);
            } finally {
                setIsLoading(false);
            }
        },
        [userInput, isLoading, canUseAi, messages, userName],
    );

    const handleSaveClick = async (text: string, index: number) => {
        setSavingStates((prev) => ({ ...prev, [index]: 'saving' }));
        try {
            const cleanText = text.replace(/:::DATA[\s\S]*?:::/g, '').replace('[PROGRAM_KAYDEDILEBILIR]', '').trim();
            await onSaveWorkout(cleanText);
            setSavingStates((prev) => ({ ...prev, [index]: 'saved' }));
        } catch (error) {
            setSavingStates((prev) => ({ ...prev, [index]: 'error' }));
            setSaveErrors((prev) => ({ ...prev, [index]: getErrorMessage(error) }));
        }
    };

    return (
        <div className="animate-fade-in max-w-4xl mx-auto flex flex-col chat-container">
            <Card className="flex-grow flex flex-col overflow-hidden !p-4 sm:!p-6">
                <h2 className="text-2xl font-bold text-white mb-4 border-b border-slate-700 pb-3">AI Buddy</h2>
                <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-4 overscroll-contain" aria-live="polite">
                    {messages.map((msg, index) => {
                        const { cleanText, cardData } =
                            msg.role === 'model' ? parseChatCard(msg.text) : { cleanText: msg.text, cardData: null as AiCardData | null };

                        return (
                            <div key={index} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div
                                    className={`max-w-[85%] lg:max-w-2xl px-4 py-3 rounded-2xl shadow break-words ${
                                        msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'
                                    }`}
                                >
                                    {msg.role === 'user' ? (
                                        <p className="whitespace-pre-wrap">{cleanText}</p>
                                    ) : (
                                        <div
                                            className="prose prose-sm prose-invert prose-p:my-1 prose-li:my-0 max-w-none"
                                            dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(cleanText) }}
                                        />
                                    )}
                                </div>

                                {cardData && <RenderAiCard data={cardData} />}

                                {msg.role === 'model' && msg.text.includes('[PROGRAM_KAYDEDILEBILIR]') && (
                                    <div className="mt-2">
                                        <button
                                            onClick={() => handleSaveClick(msg.text, index)}
                                            disabled={savingStates[index] === 'saving' || savingStates[index] === 'saved'}
                                            className="px-3 py-2 min-h-[40px] text-xs font-medium rounded-full transition-colors duration-200 flex items-center gap-1.5 bg-slate-600/50 text-slate-300 hover:bg-slate-600/80 disabled:bg-slate-600/40 disabled:text-slate-400 disabled:cursor-not-allowed"
                                        >
                                            {savingStates[index] === 'saving'
                                                ? 'Kaydediliyor...'
                                                : savingStates[index] === 'saved'
                                                  ? 'Kaydedildi ✔'
                                                  : 'Programı Kaydet'}
                                        </button>
                                        {savingStates[index] === 'error' && <p className="text-xs text-red-400 mt-1">{saveErrors[index]}</p>}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="px-4 py-3 rounded-2xl bg-slate-700 text-slate-200 rounded-bl-none" aria-label="Yanıt yazılıyor">
                                <div className="flex items-center space-x-1">
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <AiNotice isLoggedIn={isLoggedIn} onLoginRedirect={onLoginRedirect} className="mt-3" />
                <form onSubmit={handleSendMessage} className="mt-4 border-t border-slate-700 pt-4">
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            placeholder="AI Buddy'e bir mesaj yazın..."
                            disabled={isLoading || !canUseAi}
                            maxLength={4000}
                            enterKeyHint="send"
                            className="flex-grow min-w-0 bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !userInput.trim() || !canUseAi}
                            aria-label="Gönder"
                            className="bg-blue-600 text-white font-bold p-3 min-h-[48px] min-w-[48px] rounded-lg hover:bg-blue-500 disabled:bg-blue-400/50 disabled:cursor-not-allowed transition-colors duration-300"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 rotate-90" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.428A1 1 0 0010 16.171V11.18l4.472-4.472a1 1 0 00-1.414-1.414L10 8.586V3.553z" />
                            </svg>
                        </button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

export default AiBuddyChat;
