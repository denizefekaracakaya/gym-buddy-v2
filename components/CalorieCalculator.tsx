
import React, { useState, useCallback, useEffect } from 'react';
import { calculateCalories, getErrorMessage } from '../services/geminiService';
import type { CalorieFormData, UserProfile } from '../types';
import Spinner from './shared/Spinner';
import Card from './shared/Card';

interface CalorieCalculatorProps {
    userProfile?: UserProfile;
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

const CalorieCalculator: React.FC<CalorieCalculatorProps> = ({ userProfile }) => {
    const [formData, setFormData] = useState<CalorieFormData>({
        age: userProfile?.age || '25',
        gender: userProfile?.gender === 'female' ? 'female' : 'male',
        weight: userProfile?.weight || '75',
        height: userProfile?.height || '180',
        activityLevel: 'moderate',
        goal: 'maintain',
    });
    const [result, setResult] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Sync with profile when it changes (e.g. after login)
    useEffect(() => {
        if (userProfile) {
            setFormData(prev => ({
                ...prev,
                age: userProfile.age || prev.age,
                weight: userProfile.weight || prev.weight,
                height: userProfile.height || prev.height,
                // Map 'other' or undefined to existing gender or default to male if forcing a choice, 
                // but here we just check if it matches our specific options.
                gender: userProfile.gender === 'female' ? 'female' : (userProfile.gender === 'male' ? 'male' : prev.gender)
            }));
        }
    }, [userProfile]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setResult(null);
        try {
            const calculationResult = await calculateCalories(formData);
            setResult(calculationResult);
        } catch (err: any) {
            setError(getErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    }, [formData]);
    
    const renderResult = () => {
        if(!result) return null;
        return (
            <div className="prose prose-invert prose-p:my-1 prose-h3:text-blue-400 prose-strong:text-white mt-4 space-y-4">
               {result.split('\n').map((line, index) => {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('1.') || trimmedLine.startsWith('2.') || trimmedLine.startsWith('3.') || trimmedLine.startsWith('4.') || trimmedLine.startsWith('5.')) {
                        return <h3 key={index} className="font-bold text-lg text-blue-400 mt-3">{trimmedLine}</h3>
                    }
                    if(trimmedLine.startsWith('-')) {
                        return <p key={index} className="!mt-1 ml-2">{trimmedLine}</p>
                    }
                    if(trimmedLine === '') return null;
                    return <p key={index} className="!mt-1">{trimmedLine}</p>
                })}
            </div>
        )
    }

    return (
        <div className="animate-fade-in max-w-4xl mx-auto">
            <Card>
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-white">AI Kalori Hesaplayıcı</h2>
                        <p className="text-slate-400 mt-1">Hedeflerinize ulaşmak için günlük kalori ihtiyacınızı yapay zeka ile öğrenin.</p>
                    </div>
                </div>
                
                {userProfile?.name && (
                    <div className="mb-6 p-3 bg-blue-900/20 border border-blue-800 rounded-lg flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <p className="text-sm text-blue-200">Profil bilgileriniz otomatik olarak form alanlarına doldurulmuştur.</p>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <Label htmlFor="age">Yaş</Label>
                            <Input type="number" name="age" id="age" value={formData.age} onChange={handleChange} required />
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
                            <Input type="number" name="weight" id="weight" value={formData.weight} onChange={handleChange} required />
                        </div>
                        <div>
                            <Label htmlFor="height">Boy (cm)</Label>
                            <Input type="number" name="height" id="height" value={formData.height} onChange={handleChange} required />
                        </div>
                        <div className="md:col-span-2">
                            <Label htmlFor="activityLevel">Aktivite Seviyesi</Label>
                            <Select name="activityLevel" id="activityLevel" value={formData.activityLevel} onChange={handleChange}>
                                <option value="sedentary">Hareketsiz (Ofis işi)</option>
                                <option value="light">Hafif Aktif (Haftada 1-3 gün spor)</option>
                                <option value="moderate">Orta Derecede Aktif (Haftada 3-5 gün spor)</option>
                                <option value="active">Çok Aktif (Haftada 6-7 gün spor)</option>
                                <option value="very_active">Ekstra Aktif (Ağır iş + spor)</option>
                            </Select>
                        </div>
                        <div className="md:col-span-2">
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
                        className="mt-8 w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-500 disabled:bg-blue-400/50 disabled:cursor-not-allowed transition-colors duration-300"
                    >
                        {isLoading ? 'Hesaplanıyor...' : 'Hesapla'}
                    </button>
                </form>
            </Card>

            {isLoading && <div className="mt-8"><Spinner /></div>}
            {error && <Card className="mt-8"><p className="text-red-400 text-center">{error}</p></Card>}

            {result && (
                <Card className="mt-8 animate-fade-in-up">
                    <h2 className="text-2xl font-bold text-white mb-4">Sonuçlar ve Tavsiyeler</h2>
                    <div className="text-slate-300 leading-relaxed">
                        {renderResult()}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default CalorieCalculator;
