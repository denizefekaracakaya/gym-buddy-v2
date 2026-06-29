import React, { useState, useCallback } from 'react';
import type { UserProfile } from '../types';
import { calculateBodyFat, getErrorMessage } from '../services/geminiService';
import Card from './shared/Card';
import Spinner from './shared/Spinner';

interface BodyFatCalculatorProps {
    userProfile: UserProfile;
    onProfileRedirect: () => void;
}

const BodyFatCalculator: React.FC<BodyFatCalculatorProps> = ({ userProfile, onProfileRedirect }) => {
    const [bodyFatResult, setBodyFatResult] = useState<string | null>(null);
    const [isCalculating, setIsCalculating] = useState<boolean>(false);
    const [calculationError, setCalculationError] = useState<string | null>(null);

    const canCalculate = useCallback(() => {
        const { gender, height, neck, waist, hip } = userProfile;
        if (!height || !neck || !waist) return false;
        if (gender === 'female' && !hip) return false;
        return true;
    }, [userProfile]);

    const handleCalculateBodyFat = useCallback(async () => {
        if (!canCalculate()) {
            setCalculationError("Lütfen hesaplama için gerekli tüm alanları profilinizde doldurun.");
            return;
        }

        setIsCalculating(true);
        setCalculationError(null);
        setBodyFatResult(null);

        try {
            const { gender, height, neck, waist, hip } = userProfile;
            const result = await calculateBodyFat({
                gender,
                height: height!,
                neck: neck!,
                waist: waist!,
                hip: hip
            });
            setBodyFatResult(result);
        } catch (err: any) {
            setCalculationError(getErrorMessage(err));
        } finally {
            setIsCalculating(false);
        }
    }, [userProfile, canCalculate]);
    
    const renderBodyFatResult = () => {
        if (!bodyFatResult) return null;
        return (
            <div className="prose prose-invert prose-p:my-1 prose-h3:text-blue-400 prose-strong:text-white mt-4 space-y-4">
               {bodyFatResult.split('\n').map((line, index) => {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('1.') || trimmedLine.startsWith('2.') || trimmedLine.startsWith('3.')) {
                        return <h3 key={index} className="font-bold text-lg text-blue-400 mt-3">{trimmedLine}</h3>;
                    }
                    if (trimmedLine.startsWith('-')) {
                        return <p key={index} className="!mt-1 ml-2">{trimmedLine}</p>;
                    }
                    if (trimmedLine === '') return null;
                    return <p key={index} className="!mt-1">{trimmedLine}</p>;
                })}
            </div>
        );
    };

    return (
        <div className="animate-fade-in max-w-4xl mx-auto">
            <Card>
                <h2 className="text-2xl font-bold text-white mb-4">Vücut Yağ Oranı Hesaplama</h2>
                <p className="text-slate-400 mb-6">
                    Doğru bir tahmin için profilinize boy, boyun, bel (ve kadınlar için kalça) ölçülerinizi girin. Hesaplama, ABD Donanması yöntemini kullanır ve bir tahmindir.
                </p>

                {!canCalculate() && (
                    <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-300 p-4 rounded-lg mb-6 text-center">
                        <p className="font-semibold">Hesaplama için bilgileriniz eksik.</p>
                        <p className="text-sm mt-1">Lütfen boy, boyun ve bel ölçülerinizi girin.</p>
                        <button onClick={onProfileRedirect} className="font-bold underline mt-2 hover:text-yellow-200 transition-colors">
                            Profili Düzenle
                        </button>
                    </div>
                )}
                
                <button
                    onClick={handleCalculateBodyFat}
                    disabled={isCalculating || !canCalculate()}
                    className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed transition-colors duration-300"
                >
                    {isCalculating ? 'Hesaplanıyor...' : 'Vücut Yağ Oranını Hesapla'}
                </button>

                {isCalculating && <div className="mt-8"><Spinner /></div>}
                {calculationError && <Card className="mt-8"><p className="text-red-400 text-center">{calculationError}</p></Card>}

                {bodyFatResult && (
                    <Card className="mt-8 animate-fade-in-up">
                        <h3 className="text-xl font-bold text-white mb-4">Hesaplama Sonucu</h3>
                        <div className="text-slate-300 leading-relaxed">
                            {renderBodyFatResult()}
                        </div>
                    </Card>
                )}
            </Card>
        </div>
    );
};

export default BodyFatCalculator;
