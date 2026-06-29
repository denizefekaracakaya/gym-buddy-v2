


import React, { useState, useRef, useCallback } from 'react';
import { analyzeMealImage, analyzeMealFromText, getErrorMessage } from '../services/geminiService';
import type { NutritionInfo } from '../types';
import Spinner from './shared/Spinner';
import Card from './shared/Card';
import PieChart from './shared/PieChart';
import { CameraIcon } from '../constants';

const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
        };
        reader.onerror = error => reject(error);
    });

const MealAnalyzer: React.FC = () => {
    const [analysisMode, setAnalysisMode] = useState<'image' | 'manual'>('image');
    const [manualInput, setManualInput] = useState<string>('');
    const [manualWeight, setManualWeight] = useState<string>('');
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [result, setResult] = useState<NutritionInfo | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setResult(null);
            setError(null);
            setImageFile(file);
            const reader = new FileReader();
            reader.onload = (e) => {
                setImageSrc(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleAnalyzeClick = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            let analysisResult: NutritionInfo;
            if (analysisMode === 'image' && imageFile) {
                const base64Image = await toBase64(imageFile);
                analysisResult = await analyzeMealImage(base64Image, imageFile.type);
            } else if (analysisMode === 'manual' && manualInput.trim()) {
                analysisResult = await analyzeMealFromText(manualInput.trim(), manualWeight);
            } else {
                setError("Lütfen analiz için bir resim yükleyin veya bir açıklama girin.");
                setIsLoading(false);
                return;
            }
            setResult(analysisResult);
        } catch (err: any) {
            setError(getErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    }, [analysisMode, imageFile, manualInput, manualWeight]);


    const handleReset = () => {
        setImageSrc(null);
        setImageFile(null);
        setResult(null);
        setError(null);
        setManualInput('');
        setManualWeight('');
        if(fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }

    const pieChartData = result ? [
        { name: 'Karbonhidrat', value: result.carbohydrates, color: '#fbbf24' }, // amber-400
        { name: 'Protein', value: result.protein, color: '#34d399' },      // emerald-400
        { name: 'Yağ', value: result.fat, color: '#f87171' },               // red-400
    ] : [];

    const totalMacros = result ? result.carbohydrates + result.protein + result.fat : 0;
    
    const canAnalyze = (analysisMode === 'image' && imageFile !== null) || (analysisMode === 'manual' && manualInput.trim().length > 0);

    return (
        <div className="animate-fade-in max-w-4xl mx-auto">
            <Card>
                <h2 className="text-2xl font-bold text-white">Yemek Analizi</h2>
                <p className="text-slate-400 mt-1 mb-6">Öğününüzü analiz etmek için bir yöntem seçin.</p>

                <div className="flex bg-slate-800 rounded-lg p-1 mb-6">
                    <button 
                        onClick={() => { setAnalysisMode('image'); setResult(null); setError(null); }}
                        className={`flex-1 py-2 px-4 text-sm font-semibold rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-blue-500 ${analysisMode === 'image' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
                    >
                        Fotoğraf ile Analiz
                    </button>
                    <button 
                        onClick={() => { setAnalysisMode('manual'); setResult(null); setError(null); }}
                        className={`flex-1 py-2 px-4 text-sm font-semibold rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-blue-500 ${analysisMode === 'manual' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
                    >
                        Manuel Giriş
                    </button>
                </div>
                
                {analysisMode === 'image' && (
                    <div className="space-y-4">
                        {imageSrc ? (
                            <img src={imageSrc} alt="Yemek önizlemesi" className="w-full max-h-80 object-contain rounded-lg bg-slate-800" />
                        ) : (
                             <div className="text-center p-6 border-2 border-dashed border-slate-700 rounded-lg">
                                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-slate-700">
                                    <CameraIcon />
                                </div>
                                <p className="mt-2 text-slate-400">Analiz için fotoğraf çekin veya yükleyin.</p>
                            </div>
                        )}
                         <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleImageChange}
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full bg-slate-700 text-white font-bold py-3 px-4 rounded-lg hover:bg-slate-600 transition-colors duration-300"
                        >
                            {imageSrc ? 'Fotoğrafı Değiştir' : 'Fotoğraf Çek / Yükle'}
                        </button>
                    </div>
                )}
                
                {analysisMode === 'manual' && (
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="manual-meal-input" className="block text-sm font-medium text-slate-300 mb-2">Yediğiniz yemeği tarif edin</label>
                            <textarea
                                id="manual-meal-input"
                                rows={4}
                                value={manualInput}
                                onChange={(e) => setManualInput(e.target.value)}
                                placeholder="Örnek: 1 tabak tavuklu pilav, yanında bol yeşillikli salata..."
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                            />
                        </div>
                        <div>
                            <label htmlFor="manual-meal-weight" className="block text-sm font-medium text-slate-300 mb-2">Porsiyon Ağırlığı (gram - isteğe bağlı)</label>
                            <input
                                id="manual-meal-weight"
                                type="number"
                                value={manualWeight}
                                onChange={(e) => setManualWeight(e.target.value)}
                                placeholder="Örn: 350"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                        </div>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4 mt-6">
                    <button
                        onClick={handleAnalyzeClick}
                        disabled={isLoading || !canAnalyze}
                        className="flex-grow w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-500 disabled:bg-blue-400/50 disabled:cursor-not-allowed transition-colors duration-300 flex items-center justify-center gap-2"
                    >
                        {isLoading ? 'Analiz Ediliyor...' : 'Analiz Et'}
                    </button>
                     <button
                        onClick={handleReset}
                        disabled={isLoading}
                        className="w-full sm:w-auto bg-slate-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-slate-500 transition-colors duration-300"
                    >
                        Sıfırla
                    </button>
                </div>
            </Card>

            {isLoading && <div className="mt-8"><Spinner /></div>}
            {error && <Card className="mt-8"><p className="text-red-400 text-center">{error}</p></Card>}

            {result && (
                <Card className="mt-8 animate-fade-in-up">
                    <h2 className="text-2xl font-bold text-white mb-2">{result.mealName || 'Analiz Sonuçları'}</h2>
                    <p className="text-slate-400 mb-8">{result.description || 'Yapay zeka tarafından analiz edilen besin değerleri aşağıdadır.'}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                        <div className="flex flex-col items-center">
                            <div className="relative flex items-center justify-center w-48 h-48 sm:w-56 sm:h-56">
                                <svg className="absolute" width="100%" height="100%" viewBox="0 0 200 200">
                                    <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="12" className="text-slate-700/50"/>
                                </svg>
                                <div className="absolute flex flex-col items-center justify-center">
                                    <span className="text-5xl sm:text-6xl font-bold text-white">{Math.round(result.calories)}</span>
                                    <span className="text-slate-400 text-lg">kcal</span>
                                </div>
                            </div>
                            <div className="space-y-3 mt-8 w-full max-w-xs">
                               <div className="flex justify-between items-baseline p-3 bg-slate-800/50 rounded-lg">
                                   <span className="text-slate-300">Protein</span>
                                   <span className="font-bold text-white text-lg">{result.protein.toFixed(1)} g</span>
                               </div>
                               <div className="flex justify-between items-baseline p-3 bg-slate-800/50 rounded-lg">
                                   <span className="text-slate-300">Karbonhidrat</span>
                                   <span className="font-bold text-white text-lg">{result.carbohydrates.toFixed(1)} g</span>
                               </div>
                               <div className="flex justify-between items-baseline p-3 bg-slate-800/50 rounded-lg">
                                   <span className="text-slate-300">Yağ</span>
                                   <span className="font-bold text-white text-lg">{result.fat.toFixed(1)} g</span>
                               </div>
                                <div className="flex justify-between items-baseline p-3 bg-slate-800/50 rounded-lg">
                                   <span className="text-slate-300">Lif</span>
                                   <span className="font-bold text-white text-lg">{result.fiber.toFixed(1)} g</span>
                               </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-center justify-center bg-slate-800 p-6 rounded-xl h-full">
                            <h3 className="text-lg font-semibold text-white mb-4">Makro Dağılımı</h3>
                            {totalMacros > 0 ? (
                                <PieChart data={pieChartData} />
                            ) : (
                                <p className="text-slate-400 text-center">Makro verileri grafiği oluşturmak için yetersiz.</p>
                            )}
                        </div>
                    </div>
                    
                    {result.vitaminsAndMinerals && result.vitaminsAndMinerals.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-slate-700">
                             <h3 className="text-xl font-bold text-white mb-4">Vitamin & Mineral Tahminleri</h3>
                             <ul className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {result.vitaminsAndMinerals.map((item) => (
                                    <li key={item.name} className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg text-sm">
                                        <span className="text-slate-300">{item.name}</span>
                                        <span className="font-medium text-white">{item.amount.toFixed(1)} {item.unit}</span>
                                    </li>
                                ))}
                             </ul>
                        </div>
                    )}
                </Card>
            )}

        </div>
    );
};

export default MealAnalyzer;