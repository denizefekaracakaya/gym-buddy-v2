import React, { useState, useCallback, useEffect } from 'react';
import { getCalorieAdvice, getErrorMessage } from '../services/geminiService';
import type { CalorieFormData, UserProfile } from '../types';
import Spinner from './shared/Spinner';
import Card from './shared/Card';
import AiNotice, { aiAvailable } from './shared/AiNotice';
import AdviceText from './shared/AdviceText';
import { calculateCalories, type CalorieResult } from '../lib/fitness';

interface CalorieCalculatorProps {
    userProfile?: UserProfile;
    isLoggedIn: boolean;
    onLoginRedirect: () => void;
}

const Label: React.FC<{ htmlFor: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-300 mb-2">{children}</label>
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input {...props} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
    <select {...props} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
);

const Stat: React.FC<{ label: string; value: string; sub?: string; highlight?: boolean }> = ({ label, value, sub, highlight }) => (
    <div className={`p-3 rounded-lg ${highlight ? 'bg-blue-600/20 border border-blue-500/40' : 'bg-slate-800/60'}`}>
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-lg font-bold text-white">{value}</div>
        {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
);

const CalorieCalculator: React.FC<CalorieCalculatorProps> = ({ userProfile, isLoggedIn, onLoginRedirect }) => {
    const [formData, setFormData] = useState<CalorieFormData>({
        age: userProfile?.age || '25',
        gender: userProfile?.gender === 'female' ? 'female' : 'male',
        weight: userProfile?.weight || '75',
        height: userProfile?.height || '180',
        activityLevel: 'moderate',
        goal: 'maintain',
    });
    const [result, setResult] = useState<CalorieResult | null>(null);
    const [advice, setAdvice] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [adviceError, setAdviceError] = useState<string | null>(null);

    // Sync with profile when it changes (e.g. after login)
    useEffect(() => {
        if (userProfile) {
            setFormData((prev) => ({
                ...prev,
                age: userProfile.age || prev.age,
                weight: userProfile.weight || prev.weight,
                height: userProfile.height || prev.height,
                gender: userProfile.gender === 'female' ? 'female' : userProfile.gender === 'male' ? 'male' : prev.gender,
            }));
        }
    }, [userProfile]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            setError(null);
            setAdviceError(null);
            setResult(null);
            setAdvice(null);
            const input = {
                age: parseFloat(formData.age),
                sex: formData.gender,
                weightKg: parseFloat(formData.weight),
                heightCm: parseFloat(formData.height),
                activityLevel: formData.activityLevel,
                goal: formData.goal,
            };
            let computed: CalorieResult;
            try {
                // Numbers are computed on the device (Mifflin-St Jeor) and work offline;
                // previously the LLM did the arithmetic.
                computed = calculateCalories(input);
            } catch (err) {
                setError(getErrorMessage(err));
                return;
            }
            setResult(computed);
            if (!aiAvailable(isLoggedIn)) return;
            setIsLoading(true);
            try {
                setAdvice(
                    await getCalorieAdvice({
                        age: input.age,
                        gender: input.sex,
                        weight: input.weightKg,
                        height: input.heightCm,
                        activityLevel: input.activityLevel,
                        goal: input.goal,
                    }),
                );
            } catch (err) {
                setAdviceError(getErrorMessage(err));
            } finally {
                setIsLoading(false);
            }
        },
        [formData, isLoggedIn],
    );

    return (
        <div className="animate-fade-in max-w-4xl mx-auto">
            <Card>
                <div className="mb-4">
                    <h2 className="text-2xl font-bold text-white">AI Kalori Hesaplayıcı</h2>
                    <p className="text-slate-400 mt-1">
                        Günlük kalori ihtiyacınız Mifflin-St Jeor formülüyle hesaplanır; yapay zeka size özel tavsiyeler ekler.
                    </p>
                </div>

                {userProfile?.name && (
                    <div className="mb-6 p-3 bg-blue-900/20 border border-blue-800 rounded-lg flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <p className="text-sm text-blue-200">Profil bilgileriniz otomatik olarak form alanlarına doldurulmuştur.</p>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-2 md:grid-cols-2 gap-4 md:gap-6">
                        <div>
                            <Label htmlFor="age">Yaş</Label>
                            <Input type="number" inputMode="numeric" min="13" max="100" name="age" id="age" value={formData.age} onChange={handleChange} required />
                        </div>
                        <div>
                            <Label htmlFor="gender">Cinsiyet</Label>
                            <Select name="gender" id="gender" value={formData.gender} onChange={handleChange}>
                                <option value="male">Erkek</option>
                                <option value="female">Kadın</option>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="weight">Kilo (kg)</Label>
                            <Input type="number" inputMode="decimal" min="30" max="300" step="any" name="weight" id="weight" value={formData.weight} onChange={handleChange} required />
                        </div>
                        <div>
                            <Label htmlFor="height">Boy (cm)</Label>
                            <Input type="number" inputMode="decimal" min="120" max="250" step="any" name="height" id="height" value={formData.height} onChange={handleChange} required />
                        </div>
                        <div className="col-span-2">
                            <Label htmlFor="activityLevel">Aktivite Seviyesi</Label>
                            <Select name="activityLevel" id="activityLevel" value={formData.activityLevel} onChange={handleChange}>
                                <option value="sedentary">Hareketsiz (Ofis işi)</option>
                                <option value="light">Hafif Aktif (Haftada 1-3 gün spor)</option>
                                <option value="moderate">Orta Derecede Aktif (Haftada 3-5 gün spor)</option>
                                <option value="active">Çok Aktif (Haftada 6-7 gün spor)</option>
                                <option value="very_active">Ekstra Aktif (Ağır iş + spor)</option>
                            </Select>
                        </div>
                        <div className="col-span-2">
                            <Label htmlFor="goal">Hedefiniz</Label>
                            <Select name="goal" id="goal" value={formData.goal} onChange={handleChange}>
                                <option value="lose">Kilo Vermek</option>
                                <option value="maintain">Kilo Korumak</option>
                                <option value="gain">Kilo Almak</option>
                            </Select>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="mt-8 w-full min-h-[48px] bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-500 disabled:bg-blue-400/50 disabled:cursor-not-allowed transition-colors duration-300"
                    >
                        {isLoading ? 'Tavsiyeler hazırlanıyor...' : 'Hesapla'}
                    </button>
                </form>
            </Card>

            {error && (
                <Card className="mt-8">
                    <p className="text-red-400 text-center">{error}</p>
                </Card>
            )}

            {result && (
                <Card className="mt-8 animate-fade-in-up">
                    <h2 className="text-2xl font-bold text-white mb-4">Sonuçlar ve Tavsiyeler</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Stat label="Bazal Metabolizma (BMR)" value={`${result.bmr} kcal`} />
                        <Stat label="Günlük Harcama (TDEE)" value={`${result.tdee} kcal`} />
                        <Stat label="Hedef Günlük Kalori" value={`${result.targetKcal} kcal`} highlight />
                    </div>
                    <h3 className="font-bold text-lg text-blue-400 mt-6 mb-3">Makro Dağılımı</h3>
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        <Stat label="Protein" value={`${result.macros.proteinG} g`} sub={`${result.macros.proteinKcal} kcal`} />
                        <Stat label="Karbonhidrat" value={`${result.macros.carbsG} g`} sub={`${result.macros.carbsKcal} kcal`} />
                        <Stat label="Yağ" value={`${result.macros.fatG} g`} sub={`${result.macros.fatKcal} kcal`} />
                    </div>
                    <h3 className="font-bold text-lg text-blue-400 mt-6 mb-2">Beslenme Tavsiyeleri</h3>
                    {isLoading && <Spinner />}
                    {adviceError && <p className="text-red-400 text-sm">{adviceError}</p>}
                    {advice && <AdviceText text={advice} />}
                    {!isLoading && !advice && !adviceError && <AiNotice isLoggedIn={isLoggedIn} onLoginRedirect={onLoginRedirect} />}
                    <p className="text-xs text-slate-500 mt-6">Bu değerler tahmindir ve tıbbi tavsiye yerine geçmez.</p>
                </Card>
            )}
        </div>
    );
};

export default CalorieCalculator;
