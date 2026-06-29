




import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Chat } from "@google/genai";
import { startChatSession, getErrorMessage } from '../services/geminiService';
import type { ChatMessage, UserProfile, AiCardData } from '../types';
import Card from './shared/Card';
import { marked } from "https://esm.sh/marked@12.0.2";

interface AiBuddyChatProps {
    onSaveWorkout: (text: string) => Promise<void>;
    userProfile?: UserProfile;
    isLoggedIn?: boolean;
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

const AiBuddyChat: React.FC<AiBuddyChatProps> = ({ onSaveWorkout, userProfile, isLoggedIn }) => {
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [savingStates, setSavingStates] = useState<Record<number, 'idle' | 'saving' | 'saved'>>({});
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        try {
            const userName = isLoggedIn && userProfile?.name ? userProfile.name.split(' ')[0] : undefined;
            const chatSession = startChatSession(userName);
            setChat(chatSession);
            
            const initialMessage = userName
                ? `Merhaba, ${userName}! Ben senin kişisel AI Buddy'n. Sana nasıl yardımcı olabilirim?`
                : `Merhaba! Ben senin kişisel AI Buddy'n. Sana özel antrenman veya beslenme programı oluşturabilirim. Ne yapmak istersin?`;

            setMessages([{ role: 'model', text: initialMessage }]);
        } catch (error) {
            setMessages([{ role: 'model', text: getErrorMessage(error) }]);
        }
    }, [isLoggedIn, userProfile?.name]);
    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const handleSendMessage = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        const text = userInput.trim();
        if (!text || isLoading) return;
        
        const lowerCaseText = text.toLowerCase();
        
        setMessages(prev => [...prev, { role: 'user', text }]);
        setUserInput('');

        if (lowerCaseText.includes('yağ oranım') || lowerCaseText.includes('vücut yağımı hesapla') || lowerCaseText.includes('vücut yağı')) {
             setMessages(prev => [...prev, { role: 'model', text: "Elbette! Vücut yağ oranını hesaplamak için navigasyon çubuğundaki 'Vücut Yağı' sekmesini kullanabilirsin. Gerekli bilgileri profilinde doldurduğundan emin olmayı unutma!" }]);
             return;
        }
        
        setIsLoading(true);
        
        if (!chat) {
            setIsLoading(false);
            setMessages(prev => [...prev, { role: 'model', text: "Sohbet oturumu başlatılamadı." }]);
            return;
        }

        try {
            const stream = await chat.sendMessageStream({ message: text });
            
            let modelResponse = '';
            let firstChunk = true;

            for await (const chunk of stream) {
                modelResponse += chunk.text;
                if (firstChunk) {
                    setMessages(prev => [...prev, { role: 'model', text: modelResponse }]);
                    firstChunk = false;
                } else {
                    setMessages(prev => {
                        const newMessages = [...prev];
                        newMessages[newMessages.length - 1].text = modelResponse;
                        return newMessages;
                    });
                }
            }
        } catch (error) {
            console.error("Chat error:", error);
            const friendlyError = getErrorMessage(error);
            setMessages(prev => [...prev, { role: 'model', text: friendlyError }]);
        } finally {
            setIsLoading(false);
        }
    }, [chat, userInput, isLoading]);

    const handleSaveClick = async (text: string, index: number) => {
        setSavingStates(prev => ({...prev, [index]: 'saving' }));
        try {
            // Also strip card data if present when saving, though mostly program data wont have cards inside the save block
            const cleanText = text.replace(/:::DATA[\s\S]*?:::/g, '').replace('[PROGRAM_KAYDEDILEBILIR]', '').trim();
            await onSaveWorkout(cleanText);
            setSavingStates(prev => ({...prev, [index]: 'saved' }));
        } catch (error) {
            console.error("Failed to save workout:", error);
            setSavingStates(prev => ({...prev, [index]: 'idle' }));
            // Optionally show an error message to the user
        }
    };
    
    // Helper to extract Card data and return separate text and data
    const parseContent = (text: string): { cleanText: string, cardData: AiCardData | null } => {
        const regex = /:::DATA([\s\S]*?):::/;
        const match = text.match(regex);
        
        let cardData: AiCardData | null = null;
        let cleanText = text;

        if (match && match[1]) {
            try {
                cardData = JSON.parse(match[1]);
                cleanText = text.replace(match[0], '').trim();
            } catch (e) {
                console.error("Failed to parse card JSON", e);
            }
        }
        
        // Also remove program tag from visual text if present, handled in renderMarkdown usually but good to be safe
        cleanText = cleanText.replace('[PROGRAM_KAYDEDILEBILIR]', '').trim();

        return { cleanText, cardData };
    };

    const renderMarkdown = (text: string) => {
        const rawMarkup = marked.parse(text, { breaks: true, gfm: true });
        return { __html: rawMarkup };
    };

    return (
        <div className="animate-fade-in max-w-4xl mx-auto flex flex-col h-[calc(100vh-280px)]">
            <Card className="flex-grow flex flex-col overflow-hidden">
                <h2 className="text-2xl font-bold text-white mb-4 border-b border-slate-700 pb-3">AI Buddy</h2>
                <div className="flex-grow overflow-y-auto pr-4 -mr-4 space-y-4">
                    {messages.map((msg, index) => {
                        const { cleanText, cardData } = msg.role === 'model' ? parseContent(msg.text) : { cleanText: msg.text, cardData: null };
                        
                        return (
                            <div key={index} className={`flex flex-col items-start ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-xl lg:max-w-2xl px-4 py-3 rounded-2xl shadow ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'}`}>
                                    <div className="prose prose-sm prose-invert prose-p:my-1 prose-li:my-0" dangerouslySetInnerHTML={renderMarkdown(cleanText)} />
                                </div>
                                
                                {/* Render Smart Card if data exists */}
                                {cardData && <RenderAiCard data={cardData} />}

                                {/* Render Save Button if program tag exists */}
                                {msg.role === 'model' && msg.text.includes('[PROGRAM_KAYDEDILEBILIR]') && (
                                    <div className="mt-2">
                                        <button
                                            onClick={() => handleSaveClick(msg.text, index)}
                                            disabled={savingStates[index] === 'saving' || savingStates[index] === 'saved'}
                                            className="px-3 py-1 text-xs font-medium rounded-full transition-colors duration-200 flex items-center gap-1.5
                                                bg-slate-600/50 text-slate-300 hover:bg-slate-600/80
                                                disabled:bg-slate-600/40 disabled:text-slate-400 disabled:cursor-not-allowed"
                                        >
                                            {savingStates[index] === 'saving' ? 'Kaydediliyor...' : savingStates[index] === 'saved' ? 'Kaydedildi ✔' : 'Programı Kaydet'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {isLoading && (
                         <div className="flex justify-start">
                             <div className="max-w-xl lg:max-w-2xl px-4 py-3 rounded-2xl bg-slate-700 text-slate-200 rounded-bl-none">
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
                <form onSubmit={handleSendMessage} className="mt-4 border-t border-slate-700 pt-4">
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            placeholder="AI Buddy'e bir mesaj yazın..."
                            disabled={isLoading || !chat}
                            className="flex-grow bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition disabled:opacity-50"
                            onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSendMessage(e as any); }}
                        />

                        <button type="submit" disabled={isLoading || !userInput.trim() || !chat} className="bg-blue-600 text-white font-bold p-3 rounded-lg hover:bg-blue-500 disabled:bg-blue-400/50 disabled:cursor-not-allowed transition-colors duration-300">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 rotate-90" fill="currentColor" viewBox="0 0 20 20" >
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