
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { WaterData, WaterEstimation } from '../types';
import Card from './shared/Card';
import { 
    ResponsiveContainer, 
    LineChart, 
    Line, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ReferenceLine 
} from 'recharts';
import { CameraIcon, BellIcon } from '../constants';
import { estimateWaterVolumeFromImage, getErrorMessage } from '../services/geminiService';
import Spinner from './shared/Spinner';
import ImagePickerButton from './shared/ImagePickerButton';
import { aiAvailable } from './shared/AiNotice';
import { localDateKey, goalStreak } from '../lib/date';
import {
    hapticSuccess,
    hapticTap,
    isNative,
    requestReminderPermission,
    REMINDER_END_HOUR,
    REMINDER_START_HOUR,
    type PickedImage,
} from '../services/native';

// Local calendar day (the original used UTC via toISOString()).
const getISODateString = (date: Date): string => localDateKey(date);

interface ConfettiParticle {
    id: number;
    x: number;
    delay: number;
    duration: number;
    color: string;
    size: number;
    shape: 'circle' | 'square' | 'triangle';
    angle: number;
}

const Confetti: React.FC<{ active: boolean; onClose: () => void }> = ({ active, onClose }) => {
    const [particles, setParticles] = useState<ConfettiParticle[]>([]);

    useEffect(() => {
        if (active) {
            const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
            const shapes: ('circle' | 'square' | 'triangle')[] = ['circle', 'square', 'triangle'];
            const newParticles: ConfettiParticle[] = Array.from({ length: 140 }).map((_, i) => ({
                id: i,
                x: Math.random() * 100,
                delay: Math.random() * 2,
                duration: 2.5 + Math.random() * 2.5,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 6 + Math.random() * 8,
                shape: shapes[Math.floor(Math.random() * shapes.length)],
                angle: Math.random() * 360
            }));
            setParticles(newParticles);

            const timer = setTimeout(() => {
                onClose();
            }, 5500);
            return () => clearTimeout(timer);
        } else {
            setParticles([]);
        }
    }, [active, onClose]);

    if (!active) return null;

    return (
        <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
            {particles.map(p => {
                const shapeStyle = p.shape === 'circle' 
                    ? 'rounded-full' 
                    : p.shape === 'triangle'
                    ? 'w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent'
                    : '';
                
                const customStyle: React.CSSProperties = p.shape === 'triangle' ? {
                    position: 'absolute',
                    left: `${p.x}%`,
                    top: `-20px`,
                    borderBottom: `${p.size * 1.5}px solid ${p.color}`,
                    animation: `confetti-fall ${p.duration}s linear ${p.delay}s forwards`,
                    transform: `rotate(${p.angle}deg)`,
                } : {
                    position: 'absolute',
                    left: `${p.x}%`,
                    top: `-20px`,
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    backgroundColor: p.color,
                    animation: `confetti-fall ${p.duration}s linear ${p.delay}s forwards`,
                    transform: `rotate(${p.angle}deg)`,
                };

                return (
                    <div
                        key={p.id}
                        className={`${shapeStyle}`}
                        style={customStyle}
                    />
                );
            })}
            <style>{`
                @keyframes confetti-fall {
                    0% {
                        transform: translateY(-20px) rotate(0deg) translateX(0);
                        opacity: 1;
                    }
                    50% {
                        transform: translateY(50vh) rotate(360deg) translateX(25px);
                        opacity: 0.9;
                    }
                    100% {
                        transform: translateY(110vh) rotate(720deg) translateX(-25px);
                        opacity: 0;
                    }
                }
            `}</style>
        </div>
    );
};

const CircularWaveProgress: React.FC<{ percentage: number; intake: number; goal: number }> = ({ percentage, intake, goal }) => {
    const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
    const radius = 90;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (clampedPercentage / 100) * circumference;

    const isGoalReached = percentage >= 100;

    return (
        <div className="relative w-64 h-64 mx-auto my-6 flex items-center justify-center">
            {/* Main Circle Container for Wave */}
            <div className={`absolute inset-2 rounded-full overflow-hidden bg-slate-800 border-4 transition-all duration-700 z-0 ${
                isGoalReached 
                    ? 'border-blue-400 shadow-[0_0_25px_rgba(59,130,246,0.6)] animate-pulse-glow' 
                    : 'border-slate-700 shadow-inner'
            }`}>
                {/* Wave Animation */}
                <div 
                    className="absolute bottom-0 left-0 w-[200%] h-full opacity-90 transition-all duration-700 ease-in-out"
                    style={{ 
                        transform: `translateY(${100 - clampedPercentage}%)`,
                        backgroundColor: '#3b82f6' // Blue-500
                    }}
                >
                    <div className="absolute -top-10 left-0 w-full h-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgNTAwIDE1MCIgcHJlc2VydmVBc3BlY3RSYXRpbz0ibm9uZSIgc3R5bGU9ImhlaWdodDogMTAwJTsgd2lkdGg6IDEwMCU7IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0wLjAwLDQ5Ljk4IEMxNDkuOTksMTUwLjAwIDM0OS4yMCwtNDkuOTggNTAwLjAwLDQ5Ljk4IEw1MDAuMDAsMTUwLjAwIEwwLjAwLDE1MC4wMCBaIiBzdHlsZT0ic3Ryb2tlOiBub25lOyBmaWxsOiAjM2I4MmY2OyI+PC9wYXRoPjwvc3ZnPg==')] bg-repeat-x bg-contain animate-wave"></div>
                </div>
            </div>

            {/* Overlay Text */}
            <div className="relative z-10 text-center drop-shadow-md">
                 <div className="flex items-baseline justify-center">
                     <span className={`text-5xl font-bold tracking-tight transition-colors duration-500 ${isGoalReached ? 'text-green-300 font-extrabold scale-110' : 'text-white'}`}>{intake}</span>
                     <span className="text-lg text-slate-200 ml-1 font-medium">ml</span>
                </div>
                <p className={`text-sm mt-1 font-medium px-3 py-1 rounded-full backdrop-blur-sm transition-all duration-500 ${
                    isGoalReached 
                        ? 'bg-green-500/20 text-green-200 border border-green-500/30 shadow-[0_0_10px_rgba(74,222,128,0.2)]' 
                        : 'bg-slate-900/40 text-slate-300'
                }`}>
                    Hedef: {goal} ml
                </p>
            </div>

            {/* Progress Ring SVG */}
            <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90 pointer-events-none z-20">
                {/* Track */}
                <circle
                    cx="128"
                    cy="128"
                    r={radius}
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-slate-700/30"
                />
                {/* Indicator */}
                <circle
                    cx="128"
                    cy="128"
                    r={radius}
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className={`transition-all duration-1000 ease-out ${isGoalReached ? 'text-green-400' : 'text-blue-400'}`}
                />
            </svg>
            
            {/* Inline Style for Keyframes */}
            <style>{`
                @keyframes wave {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-wave {
                    animation: wave 4s linear infinite;
                }
                @keyframes pulse-glow {
                    0%, 100% {
                        box-shadow: 0 0 15px rgba(59, 130, 246, 0.4), inset 0 0 10px rgba(59, 130, 246, 0.2);
                        border-color: #60a5fa;
                    }
                    50% {
                        box-shadow: 0 0 30px rgba(59, 130, 246, 0.8), inset 0 0 15px rgba(59, 130, 246, 0.4);
                        border-color: #3b82f6;
                    }
                }
                .animate-pulse-glow {
                    animation: pulse-glow 3s infinite ease-in-out;
                }
            `}</style>
        </div>
    );
};

const WeeklyChart: React.FC<{ log: Record<string, number>; goal: number }> = ({ log, goal }) => {
    const weekData = useMemo(() => {
        const data = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateString = getISODateString(date);
            const intake = log[dateString] || 0;
            const percentage = goal > 0 ? Math.min((intake / goal) * 100, 100) : 0;
            const dayLabel = date.toLocaleDateString('tr-TR', { weekday: 'short' });
            data.push({ dateString, intake, percentage, dayLabel });
        }
        return data;
    }, [log, goal]);
    
    if (weekData.every(d => d.intake === 0)) {
        return (
             <div className="text-center py-10 px-4 rounded-lg bg-slate-800/50">
                <p className="text-slate-400">Haftalık verileriniz henüz mevcut değil.</p>
                <p className="text-slate-500 text-sm mt-1">Su tüketiminizi kaydederek başlayın.</p>
            </div>
        )
    }

    return (
        <div className="flex justify-between items-end h-48 p-4 bg-slate-800/50 rounded-lg" aria-label="Haftalık su tüketim grafiği">
            {weekData.map(({ dateString, intake, percentage, dayLabel }) => (
                <div key={dateString} className="flex flex-col items-center w-[12%] h-full">
                    <div className="w-full h-full flex items-end relative group">
                        <div
                            className="w-full bg-blue-500 rounded-t-md transition-all duration-500 relative"
                            style={{ height: `${percentage}%` }}
                        >
                            {/* Tooltip */}
                             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                                {intake} ml
                            </div>
                        </div>
                    </div>
                    <span className="text-xs text-slate-400 mt-2">{dayLabel}</span>
                </div>
            ))}
        </div>
    );
};


const MonthlyWaterChart: React.FC<{ log: Record<string, number>; goal: number }> = ({ log, goal }) => {
    const monthlyData = useMemo(() => {
        const data = [];
        const today = new Date();
        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateString = getISODateString(date);
            const intake = log[dateString] || 0;
            const label = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
            data.push({ 
                dateString, 
                intake, 
                label,
                goal 
            });
        }
        return data;
    }, [log, goal]);

    const hasData = useMemo(() => {
        return monthlyData.some(d => d.intake > 0);
    }, [monthlyData]);

    if (!hasData) {
        return (
            <div className="text-center py-10 px-4 rounded-lg bg-slate-800/50">
                <p className="text-slate-400">Son 30 güne ait su tüketim verisi bulunmuyor.</p>
                <p className="text-slate-500 text-sm mt-1">Su içmeye devam ettikçe bu grafik güncellenecektir.</p>
            </div>
        );
    }

    return (
        <div className="w-full h-64 bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData} margin={{ top: 15, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis 
                        dataKey="label" 
                        stroke="#94a3b8" 
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        dy={8}
                    />
                    <YAxis 
                        stroke="#94a3b8" 
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value} ml`}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '0.5rem',
                            color: '#f8fafc',
                            fontSize: '12px'
                        }}
                        formatter={(value: any) => [`${value} ml`, 'Su Tüketimi']}
                        labelFormatter={(label) => `${label}`}
                    />
                    {goal > 0 && (
                        <ReferenceLine
                            ifOverflow="extendDomain"
                            y={goal} 
                            stroke="#ef4444" 
                            strokeDasharray="3 3" 
                            label={{ 
                                value: `Hedef: ${goal} ml`, 
                                fill: '#ef4444', 
                                fontSize: 9, 
                                position: 'top',
                                offset: 5
                            }} 
                        />
                    )}
                    <Line 
                        type="monotone" 
                        dataKey="intake" 
                        stroke="#3b82f6" 
                        strokeWidth={2.5}
                        dot={{ r: 2, stroke: '#3b82f6', strokeWidth: 1, fill: '#1e293b' }}
                        activeDot={{ r: 5 }}
                        name="Su Tüketimi"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};


const calculateStreak = (log: Record<string, number>, goal: number): number => goalStreak(log, goal);

const WaterTracker: React.FC<{
    waterData: WaterData;
    setWaterData: React.Dispatch<React.SetStateAction<WaterData>>;
    /** Local YYYY-MM-DD; updated by App on resume / day change. */
    todayKey: string;
    isLoggedIn: boolean;
    onLoginRedirect: () => void;
}> = ({ waterData, setWaterData, todayKey, isLoggedIn, onLoginRedirect }) => {
    const [customAmount, setCustomAmount] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<WaterEstimation | null>(null);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [reminderMessage, setReminderMessage] = useState<string | null>(null);
    const todayString = todayKey;
    const currentIntake = waterData.log[todayString] || 0;
    const dailyGoal = waterData.goal;

    const streakCount = useMemo(() => {
        return calculateStreak(waterData.log, dailyGoal);
    }, [waterData.log, dailyGoal]);

    const addWater = useCallback((amount: number) => {
        if (isNaN(amount) || amount <= 0 || amount > 5000) return;
        const currentToday = waterData.log[todayString] || 0;
        const newIntake = currentToday + amount;
        // Check if we just crossed the hydration goal
        if (currentToday < waterData.goal && newIntake >= waterData.goal && waterData.goal > 0) {
            setShowConfetti(true);
            hapticSuccess();
        } else {
            hapticTap();
        }
        setWaterData(prev => ({
            ...prev,
            log: { ...prev.log, [todayString]: (prev.log[todayString] || 0) + amount }
        }));
    }, [todayString, setWaterData, waterData.log, waterData.goal]);

    const handleCustomAdd = (e: React.FormEvent) => {
        e.preventDefault();
        const amount = parseInt(customAmount, 10);
        if (!isNaN(amount) && amount > 0) {
            addWater(amount);
            setCustomAmount('');
        }
    };
    
    const resetToday = useCallback(() => {
        setWaterData(prev => ({
            ...prev,
            log: { ...prev.log, [todayString]: 0 }
        }));
    }, [todayString, setWaterData]);
    
    const handleGoalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newGoal = parseInt(e.target.value, 10);
        if (!isNaN(newGoal) && newGoal >= 0 && newGoal <= 10000) {
             setWaterData(prev => ({ ...prev, goal: newGoal }));
        }
    }
    
    const handleReminderToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const isEnabled = e.target.checked;
        setReminderMessage(null);

        if (!isEnabled) {
            setWaterData(prev => ({ ...prev, reminderEnabled: false }));
            return;
        }

        try {
            // Asked only when the user turns reminders on (Android 13+ shows the system dialog).
            const permission = await requestReminderPermission();
            if (permission === 'granted') {
                setWaterData(prev => ({ ...prev, reminderEnabled: true }));
                setReminderMessage('Hatırlatıcılar açıldı 💧');
            } else if (permission === 'unsupported') {
                setReminderMessage('Bu cihaz veya tarayıcı bildirimleri desteklemiyor.');
            } else {
                setWaterData(prev => ({ ...prev, reminderEnabled: false }));
                setReminderMessage(
                    isNative
                        ? 'Bildirim izni verilmedi. Ayarlar > Uygulamalar > Gym Buddy > Bildirimler bölümünden izin verebilirsiniz.'
                        : 'Bildirim izni verilmedi. Lütfen tarayıcı ayarlarından bildirimlere izin verin.'
                );
            }
        } catch (error) {
            setWaterData(prev => ({ ...prev, reminderEnabled: false }));
            setReminderMessage('Bildirim izni istenirken bir hata oluştu.');
        }
    };

    const handleIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setWaterData(prev => ({ ...prev, reminderInterval: parseInt(e.target.value, 10) }));
    };

    const handleImagePicked = async (image: PickedImage) => {
        setIsAnalyzing(true);
        setAnalysisResult(null);
        setAnalysisError(null);
        try {
            const result = await estimateWaterVolumeFromImage(image.base64, image.mimeType);
            setAnalysisResult(result);
        } catch (err: any) {
            setAnalysisError(getErrorMessage(err));
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleConfirmAnalysis = () => {
        if (analysisResult && analysisResult.estimatedVolume > 0) {
            addWater(Math.round(analysisResult.estimatedVolume));
        }
        setAnalysisResult(null);
        setAnalysisError(null);
    };

    const closeAnalysisModal = () => {
        setAnalysisResult(null);
        setAnalysisError(null);
        setIsAnalyzing(false);
    };

    const progressPercentage = dailyGoal > 0 ? (currentIntake / dailyGoal) * 100 : 0;

    return (
        <div className="animate-fade-in max-w-4xl mx-auto space-y-8">
            <Confetti active={showConfetti} onClose={() => setShowConfetti(false)} />
            
            <Card>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-1">Günlük Su Tüketimi</h2>
                        <p className="text-slate-400 text-sm">Bugünkü hedefine ne kadar kaldığını gör.</p>
                        
                        <div className="mt-2.5 flex flex-wrap gap-2">
                            {streakCount > 0 ? (
                                <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-3 py-1 rounded-full text-xs font-semibold shadow-[0_0_15px_rgba(245,158,11,0.1)] animate-pulse-slow">
                                    <span className="text-sm">🔥</span>
                                    <span>{streakCount} Günlük Seri</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/50 text-slate-400 px-3 py-1 rounded-full text-xs font-medium">
                                    <span className="text-sm text-blue-400">💧</span>
                                    <span>Bugün Hedefe Ulaşarak Seriye Başla!</span>
                                </div>
                            )}
                        </div>
                    </div>
                     <div className="mt-4 md:mt-0 flex items-center gap-2 bg-slate-800 p-2 rounded-lg">
                        <label htmlFor="daily-goal" className="text-xs text-slate-400 font-medium whitespace-nowrap">Hedef (ml):</label>
                        <input
                            id="daily-goal"
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max="10000"
                            value={dailyGoal}
                            onChange={handleGoalChange}
                            className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                </div>
                
                <div className="flex flex-col items-center justify-center relative">
                     <CircularWaveProgress percentage={progressPercentage} intake={currentIntake} goal={dailyGoal} />

                    <div 
                        className={`mt-2 px-4 py-1.5 rounded-full transition-all duration-500 ${
                            progressPercentage >= 100 
                                ? 'bg-green-500/20 border border-green-500/40 shadow-[0_0_15px_rgba(74,222,128,0.25)] scale-105 hover:scale-110 active:scale-95 cursor-pointer animate-bounce-subtle' 
                                : 'bg-slate-800/80 border border-slate-700/50 backdrop-blur-sm'
                        }`}
                        onClick={() => progressPercentage >= 100 && setShowConfetti(true)}
                        title={progressPercentage >= 100 ? "Kutlamayı tekrar oynat" : undefined}
                    >
                         <p className={`text-sm font-semibold transition-colors duration-500 ${progressPercentage >= 100 ? 'text-green-400' : 'text-blue-400'} flex items-center gap-1.5`}>
                            {progressPercentage >= 100 ? (
                                <>
                                    <span>🎉 Tebrikler! Hedefe Ulaşıldı!</span>
                                    <span className="animate-wiggle inline-block">✨</span>
                                </>
                            ) : `%${Math.round(progressPercentage)} tamamlandı`}
                        </p>
                    </div>
                    
                    <style>{`
                        @keyframes bounce-subtle {
                            0%, 100% { transform: scale(1.05) translateY(0); }
                            50% { transform: scale(1.08) translateY(-3px); }
                        }
                        @keyframes wiggle {
                            0%, 100% { transform: rotate(0deg); }
                            25% { transform: rotate(-8deg); }
                            75% { transform: rotate(8deg); }
                        }
                        .animate-bounce-subtle {
                            animation: bounce-subtle 4s infinite ease-in-out;
                        }
                        .animate-wiggle {
                            animation: wiggle 1s infinite ease-in-out;
                        }
                        @keyframes pulse-slow {
                            0%, 100% { opacity: 1; transform: scale(1); }
                            50% { opacity: 0.92; transform: scale(1.02); }
                        }
                        .animate-pulse-slow {
                            animation: pulse-slow 3s infinite ease-in-out;
                        }
                    `}</style>
                </div>
                
                <div className="mt-8 grid grid-cols-2 gap-4">
                    <button onClick={() => addWater(200)} className="py-3 px-4 min-h-[56px] rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors duration-200 font-semibold text-slate-200 shadow-md active:transform active:scale-95 flex flex-col items-center justify-center gap-1">
                        <span>+200 ml</span>
                        <span className="text-xs text-slate-400 font-normal">Bardak</span>
                    </button>
                    <button onClick={() => addWater(500)} className="py-3 px-4 min-h-[56px] rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors duration-200 font-semibold text-slate-200 shadow-md active:transform active:scale-95 flex flex-col items-center justify-center gap-1">
                        <span>+500 ml</span>
                        <span className="text-xs text-slate-400 font-normal">Şişe</span>
                    </button>
                </div>
                
                <form onSubmit={handleCustomAdd} className="mt-4 flex gap-4">
                     <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="5000"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        placeholder="Özel miktar (ml)"
                        className="flex-grow bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button type="submit" className="bg-blue-600 text-white font-bold py-3 px-5 rounded-lg hover:bg-blue-500 disabled:bg-blue-400/50 disabled:cursor-not-allowed transition-colors duration-300 shadow-lg shadow-blue-900/20">Ekle</button>
                </form>
                 
                 <div className="mt-8 pt-6 border-t border-slate-700/50">
                    <ImagePickerButton
                        onPicked={handleImagePicked}
                        onError={(msg) => setAnalysisError(msg)}
                        disabled={isAnalyzing || !aiAvailable(isLoggedIn)}
                        className="w-full bg-indigo-600/90 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-3 shadow-lg shadow-indigo-900/30 group"
                    >
                        <div className="p-2 bg-indigo-500 rounded-lg group-hover:bg-indigo-400 transition-colors">
                            <CameraIcon />
                        </div>
                        <div className="text-left">
                            <div className="text-sm font-medium opacity-90">AI Kamera ile</div>
                            <div className="text-lg leading-none">Suyu Ölç ve Ekle</div>
                        </div>
                    </ImagePickerButton>
                    {!aiAvailable(isLoggedIn) && (
                        <p className="text-xs text-slate-500 mt-2 text-center">
                            {isLoggedIn ? 'Yapay zeka özellikleri bu sürümde kapalı.' : (
                                <button onClick={onLoginRedirect} className="underline min-h-[44px]">AI kamera için giriş yapın</button>
                            )}
                        </p>
                    )}
                </div>
                
                 <div className="mt-6 flex justify-center">
                     <button
                        onClick={resetToday}
                        className="text-slate-500 text-sm hover:text-red-400 transition-colors duration-300 underline underline-offset-4"
                    >
                        Bugünün kaydını sıfırla
                    </button>
                </div>
            </Card>

            <Card>
                <div className="flex items-center gap-2 mb-4">
                    <BellIcon />
                    <h2 className="text-xl font-bold text-white">Hatırlatıcı Ayarları</h2>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-800 rounded-xl">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out">
                            <input
                                type="checkbox"
                                id="reminder-toggle"
                                checked={waterData.reminderEnabled}
                                onChange={handleReminderToggle}
                                className="peer absolute w-12 h-6 opacity-0 z-10 cursor-pointer"
                            />
                            <label htmlFor="reminder-toggle" className="block w-12 h-6 bg-slate-600 rounded-full peer-checked:bg-blue-600 transition-colors"></label>
                            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-6"></div>
                        </div>
                        <label htmlFor="reminder-toggle" className="text-slate-300 font-medium cursor-pointer">
                            Bildirimleri Aç
                        </label>
                    </div>

                    {waterData.reminderEnabled && (
                        <div className="flex items-center gap-2 w-full sm:w-auto animate-fade-in">
                            <span className="text-slate-400 text-sm whitespace-nowrap">Sıklık:</span>
                            <select
                                value={waterData.reminderInterval}
                                onChange={handleIntervalChange}
                                className="bg-slate-700 text-white text-sm rounded-lg p-2.5 border border-slate-600 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-auto"
                            >
                                <option value={30}>30 Dakikada Bir</option>
                                <option value={45}>45 Dakikada Bir</option>
                                <option value={60}>Saat Başı (1 Saat)</option>
                                <option value={90}>1.5 Saatte Bir</option>
                                <option value={120}>2 Saatte Bir</option>
                                <option value={180}>3 Saatte Bir</option>
                            </select>
                        </div>
                    )}
                </div>
                {reminderMessage && <p className="text-sm text-slate-300 mt-3 px-2" role="status">{reminderMessage}</p>}
                <p className="text-xs text-slate-500 mt-2 px-2">
                    {isNative
                        ? `* Hatırlatıcılar ${REMINDER_START_HOUR}:00–${REMINDER_END_HOUR}:00 arasında, uygulama kapalıyken de gönderilir.${isLoggedIn ? '' : ' Giriş yapmanız gerekir.'}`
                        : '* Bildirimler sadece tarayıcı sekmesi açıkken çalışır. Tarayıcı izni gereklidir.'}
                </p>
            </Card>
            
             <Card>
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Haftalık Özet
                </h2>
                <WeeklyChart log={waterData.log} goal={dailyGoal} />
            </Card>

             <Card>
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Son 30 Günlük Su Tüketimi
                </h2>
                <MonthlyWaterChart log={waterData.log} goal={dailyGoal} />
            </Card>
            
            {/* Photo-analysis result dialog */}
            {(isAnalyzing || analysisResult || analysisError) && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4 pb-[calc(1rem+var(--safe-bottom))] animate-fade-in" onClick={closeAnalysisModal} aria-modal="true" role="dialog">
                    <Card className="w-full max-w-sm border border-slate-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        {isAnalyzing && !analysisResult && (
                            <div className="text-center py-8">
                                <h3 className="text-xl font-bold text-white mb-6">Analiz Ediliyor...</h3>
                                <Spinner />
                                <p className="text-slate-400 mt-6 text-sm">Yapay zeka bardaktaki su miktarını hesaplıyor.</p>
                            </div>
                        )}
                        {analysisError && (
                            <div className="text-center">
                                <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2">Analiz Başarısız</h3>
                                <p className="text-slate-400 text-sm mb-6">{analysisError}</p>
                                <button onClick={closeAnalysisModal} className="w-full bg-slate-700 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-slate-600 transition-colors">
                                    Kapat
                                </button>
                            </div>
                        )}
                        {analysisResult && (
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-white mb-1">Analiz Sonucu</h3>
                                <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-6">AI Tahmini</p>
                                
                                <div className="my-8 relative inline-block">
                                    <span className="text-6xl font-bold text-blue-400 tracking-tighter">{Math.round(analysisResult.estimatedVolume)}</span>
                                    <span className="text-xl text-slate-500 absolute -right-6 top-1 font-medium">ml</span>
                                </div>
                                
                                <div className="text-left bg-slate-800/80 border border-slate-700/50 p-4 rounded-xl mb-6">
                                    <p className="text-sm text-slate-300 leading-relaxed">{analysisResult.reasoning}</p>
                                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-700/50">
                                         <div className={`w-2 h-2 rounded-full ${analysisResult.confidence === 'high' ? 'bg-green-500' : analysisResult.confidence === 'medium' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                                         <p className="text-xs text-slate-400">Güven Seviyesi: <span className="text-slate-300 font-medium capitalize">{analysisResult.confidence === 'high' ? 'Yüksek' : analysisResult.confidence === 'medium' ? 'Orta' : 'Düşük'}</span></p>
                                    </div>
                                </div>

                                {analysisResult.estimatedVolume > 0 ? (
                                    <div className="flex gap-3">
                                        <button onClick={closeAnalysisModal} className="flex-1 bg-slate-700 text-slate-200 font-bold py-3 px-4 rounded-lg hover:bg-slate-600 transition-colors">
                                            İptal
                                        </button>
                                        <button onClick={handleConfirmAnalysis} className="flex-1 bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/30">
                                            Onayla
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={closeAnalysisModal} className="w-full bg-slate-700 text-white font-bold py-3 px-4 rounded-lg hover:bg-slate-600 transition-colors">
                                        Kapat
                                    </button>
                                )}
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
};

export default WaterTracker;
