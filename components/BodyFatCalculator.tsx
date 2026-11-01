import React, { useState, useCallback, useMemo } from 'react';
import type { UserProfile } from '../types';
import { getBodyFatAdvice, getErrorMessage } from '../services/geminiService';
import Card from './shared/Card';
import Spinner from './shared/Spinner';
import AiNotice, { aiAvailable } from './shared/AiNotice';
import AdviceText from './shared/AdviceText';
import { BODY_FAT_CATEGORY_LABELS, bodyFatCategory, navyBodyFatPercent, type Sex } from '../lib/fitness';

interface BodyFatCalculatorProps {
    userProfile: UserProfile;
    isLoggedIn: boolean;
    onLoginRedirect: () => void;
    onProfileRedirect: () => void;
}

const BodyFatCalculator: React.FC<BodyFatCalculatorProps> = ({ userProfile, isLoggedIn, onLoginRedirect, onProfileRedirect }) => {
    // The US Navy formula exists only for male/female; profiles set to "other" choose one.
    const [formulaSex, setFormulaSex] = useState<Sex>(userProfile.gender === 'female' ? 'female' : 'male');
    const sex: Sex = userProfile.gender === 'male' || userProfile.gender === 'female' ? userProfile.gender : formulaSex;

    const [result, setResult] = useState<{ percent: number; category: string } | null>(null);
    const [advice, setAdvice] = useState<string | null>(null);
    const [isCalculating, setIsCalculating] = useState<boolean>(false);
    const [calculationError, setCalculationError] = useState<string | null>(null);
    const [adviceError, setAdviceError] = useState<string | null>(null);

    const hasRequired = useMemo(() => {
        const { height, neck, waist, hip } = userProfile;
        if (!height || !neck || !waist) return false;
        if (sex === 'female' && !hip) return false;
        return true;
    }, [userProfile, sex]);

    const handleCalculateBodyFat = useCallback(async () => {
        if (!hasRequired) {
            setCalculationError('Lütfen hesaplama için gerekli tüm alanları profilinizde doldurun.');
            return;
        }
        setCalculationError(null);
        setAdviceError(null);
        setResult(null);
        setAdvice(null);

        const input = {
            sex,
            heightCm: parseFloat(userProfile.height),
            neckCm: parseFloat(userProfile.neck || ''),
            waistCm: parseFloat(userProfile.waist || ''),
            hipCm: sex === 'female' ? parseFloat(userProfile.hip || '') : undefined,
        };
        let percent: number;
        try {
            // Computed on the device with the US Navy formula (previously delegated to the LLM).
            percent = navyBodyFatPercent(input);
        } catch (err) {
            setCalculationError(getErrorMessage(err));
            return;
        }
        setResult({ percent, category: BODY_FAT_CATEGORY_LABELS[bodyFatCategory(sex, percent)] });

        if (!aiAvailable(isLoggedIn)) return;
        setIsCalculating(true);
        try {
            setAdvice(
                await getBodyFatAdvice({
                    gender: sex,
                    height: input.heightCm,
                    neck: input.neckCm,
                    waist: input.waistCm,
                    hip: input.hipCm,
                }),
            );
        } catch (err) {
            setAdviceError(getErrorMessage(err));
        } finally {
            setIsCalculating(false);
        }
    }, [userProfile, sex, hasRequired, isLoggedIn]);

    return (
        <div className="animate-fade-in max-w-4xl mx-auto">
            <Card>
                <h2 className="text-2xl font-bold text-white mb-4">Vücut Yağ Oranı Hesaplama</h2>
                <p className="text-slate-400 mb-6">
                    Doğru bir tahmin için profilinize boy, boyun, bel (ve kadınlar için kalça) ölçülerinizi girin. Hesaplama, ABD Donanması
                    yöntemini kullanır ve bir tahmindir.
                </p>

                {userProfile.gender === 'other' && (
                    <div className="mb-6">
                        <p className="text-sm text-slate-300 mb-2">Formül için kullanılacak ölçüm yöntemi:</p>
                        <div className="flex bg-slate-800 rounded-lg p-1">
                            {(['male', 'female'] as const).map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setFormulaSex(s)}
                                    className={`flex-1 py-2 min-h-[44px] text-sm font-semibold rounded-md ${formulaSex === s ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
                                >
                                    {s === 'male' ? 'Erkek formülü' : 'Kadın formülü'}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {!hasRequired && (
                    <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-300 p-4 rounded-lg mb-6 text-center">
                        <p className="font-semibold">Hesaplama için bilgileriniz eksik.</p>
                        <p className="text-sm mt-1">Lütfen boy, boyun ve bel ölçülerinizi girin.</p>
                        <button onClick={onProfileRedirect} className="font-bold underline mt-2 min-h-[44px] hover:text-yellow-200 transition-colors">
                            {isLoggedIn ? 'Profili Düzenle' : 'Giriş Yap ve Profili Doldur'}
                        </button>
                    </div>
                )}

                <button
                    onClick={handleCalculateBodyFat}
                    disabled={isCalculating || !hasRequired}
                    className="w-full min-h-[48px] bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed transition-colors duration-300"
                >
                    {isCalculating ? 'Tavsiye hazırlanıyor...' : 'Vücut Yağ Oranını Hesapla'}
                </button>

                {calculationError && (
                    <Card className="mt-8">
                        <p className="text-red-400 text-center">{calculationError}</p>
                    </Card>
                )}

                {result && (
                    <Card className="mt-8 animate-fade-in-up bg-slate-800/60">
                        <h3 className="text-xl font-bold text-white mb-4">Hesaplama Sonucu</h3>
                        <div className="flex items-baseline gap-3 flex-wrap">
                            <span className="text-5xl font-bold text-white">%{result.percent}</span>
                            <span className="px-3 py-1 rounded-full bg-indigo-600/30 text-indigo-200 text-sm font-semibold">{result.category}</span>
                        </div>
                        <h4 className="font-bold text-lg text-blue-400 mt-6 mb-2">Tavsiye</h4>
                        {isCalculating && <Spinner />}
                        {adviceError && <p className="text-red-400 text-sm">{adviceError}</p>}
                        {advice && <AdviceText text={advice} />}
                        {!isCalculating && !advice && !adviceError && <AiNotice isLoggedIn={isLoggedIn} onLoginRedirect={onLoginRedirect} />}
                        <p className="text-xs text-slate-500 mt-6">Kategoriler: American Council on Exercise (ACE). Tıbbi tavsiye yerine geçmez.</p>
                    </Card>
                )}
            </Card>
        </div>
    );
};

export default BodyFatCalculator;
