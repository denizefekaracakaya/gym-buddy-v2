


import React, { useState, useCallback } from 'react';
import { generateWorkoutPlan, getErrorMessage } from '../services/geminiService';
import type { Exercise } from '../types';
import { MUSCLE_GROUPS, CheckCircleIcon, PlayIcon } from '../constants';
import Spinner from './shared/Spinner';
import Card from './shared/Card';

const EQUIPMENT_OPTIONS = ['Tümü', 'Makine', 'Serbest Ağırlık', 'Vücut Ağırlığı'];
const equipmentMapping: { [key: string]: string } = {
    'Tümü': 'any',
    'Makine': 'machine',
    'Serbest Ağırlık': 'free_weights',
    'Vücut Ağırlığı': 'bodyweight'
};

const FREQUENCY_OPTIONS = [
    { label: '1 Gün', value: '1 gün' },
    { label: '2 Gün', value: '2 gün' },
    { label: '3 Gün', value: '3 gün' },
    { label: '4 Gün', value: '4 gün' },
    { label: '5 Gün', value: '5 gün' },
    { label: '6 Gün', value: '6 gün' },
    { label: '7 Gün', value: '7 gün' },
];

const DURATION_OPTIONS = [
    { label: '15 Dakika (Hızlı)', value: '15 dakika' },
    { label: '30 Dakika', value: '30 dakika' },
    { label: '45 Dakika', value: '45 dakika' },
    { label: '1 Saat', value: '1 saat' },
    { label: '1.5 Saat', value: '1.5 saat' },
    { label: '2 Saat', value: '2 saat' },
];

interface WorkoutPlannerProps {
    isLoggedIn: boolean;
    onSavePlan: (exercises: Exercise[], muscleGroup: string) => void;
    onLoginRedirect: () => void;
}

export const WorkoutPlanner: React.FC<WorkoutPlannerProps> = ({ isLoggedIn, onSavePlan, onLoginRedirect }) => {
    const [selectedMuscle, setSelectedMuscle] = useState<string>(MUSCLE_GROUPS[0]);
    const [selectedEquipment, setSelectedEquipment] = useState<string>(EQUIPMENT_OPTIONS[0]);
    
    // New state for Step 3
    const [selectedFrequency, setSelectedFrequency] = useState<string>(FREQUENCY_OPTIONS[2].value); // Default 3 days
    const [selectedDuration, setSelectedDuration] = useState<string>(DURATION_OPTIONS[2].value); // Default 45 mins

    const [exercises, setExercises] = useState<Exercise[] | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isSaved, setIsSaved] = useState<boolean>(false);
    
    const handleGeneratePlan = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setExercises(null);
        setIsSaved(false); // Reset save state for new plan
        try {
            const equipmentKey = equipmentMapping[selectedEquipment];
            // Pass new parameters to the service
            const plan = await generateWorkoutPlan(selectedMuscle, equipmentKey, selectedFrequency, selectedDuration);
            setExercises(plan);
        } catch (err: any) {
            setError(getErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    }, [selectedMuscle, selectedEquipment, selectedFrequency, selectedDuration]);

    const handleSaveClick = useCallback(() => {
        if (!exercises) return;

        if (isLoggedIn) {
            onSavePlan(exercises, selectedMuscle);
            setIsSaved(true);
        } else {
            onLoginRedirect();
        }
    }, [isLoggedIn, exercises, selectedMuscle, onSavePlan, onLoginRedirect]);
    
    return (
        <div className="animate-fade-in">
            <Card className="mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Antrenman Planlayıcı</h2>
                <p className="text-slate-400 mb-6">Hedeflerinizi seçin ve yapay zekanın sizin için bir antrenman oluşturmasını izleyin.</p>
                
                <h3 className="text-lg font-semibold text-slate-300 mb-3">1. Kas Grubu Seçin</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                    {MUSCLE_GROUPS.map((muscle) => (
                        <button
                            key={muscle}
                            onClick={() => setSelectedMuscle(muscle)}
                            className={`px-4 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-blue-500 ${
                                selectedMuscle === muscle
                                    ? 'bg-blue-600 text-white shadow'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                        >
                            {muscle}
                        </button>
                    ))}
                </div>

                <h3 className="text-lg font-semibold text-slate-300 mb-3 mt-6">2. Ekipman Türü Seçin</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                     {EQUIPMENT_OPTIONS.map((equip) => (
                        <button
                            key={equip}
                            onClick={() => setSelectedEquipment(equip)}
                            className={`px-4 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-blue-500 ${
                                selectedEquipment === equip
                                    ? 'bg-indigo-600 text-white shadow'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                        >
                            {equip}
                        </button>
                    ))}
                </div>

                <h3 className="text-lg font-semibold text-slate-300 mb-3 mt-6">3. Program Detayları</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Haftalık Antrenman Sıklığı</label>
                        <select
                            value={selectedFrequency}
                            onChange={(e) => setSelectedFrequency(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition cursor-pointer"
                        >
                            {FREQUENCY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                         <label className="block text-sm font-medium text-slate-400 mb-2">Günlük Ortalama Süre</label>
                         <select
                            value={selectedDuration}
                            onChange={(e) => setSelectedDuration(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition cursor-pointer"
                        >
                            {DURATION_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <button
                    onClick={handleGeneratePlan}
                    disabled={isLoading}
                    className="mt-6 w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-500 disabled:bg-blue-400/50 disabled:cursor-not-allowed transition-colors duration-300 flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
                >
                    {isLoading ? 'Plan Oluşturuluyor...' : 'Antrenman Planı Oluştur'}
                </button>
            </Card>

            {isLoading && <Spinner />}
            {error && <Card><p className="text-red-400 text-center">{error}</p></Card>}

            {exercises && (
                <div className="animate-fade-in-up mt-8">
                     <div className="flex justify-between items-center mb-6 px-2 flex-wrap gap-4">
                        <div>
                             <h2 className="text-2xl font-bold text-white">Sizin İçin Oluşturulan Plan</h2>
                             <p className="text-slate-400 text-sm mt-1">{selectedFrequency} / hafta • {selectedDuration} / antrenman</p>
                        </div>
                        <button
                            onClick={handleSaveClick}
                            disabled={isLoggedIn && isSaved}
                             className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-blue-500 disabled:cursor-not-allowed ${
                                isLoggedIn 
                                    ? (isSaved ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-500')
                                    : 'bg-yellow-500 text-slate-900 hover:bg-yellow-400'
                            } ${isLoggedIn && isSaved ? 'opacity-70' : ''}`}
                        >
                            {isLoggedIn 
                                ? (isSaved ? 'Plana Eklendi ✔' : 'Bu Planı Kaydet') 
                                : 'Kaydetmek için Giriş Yap'}
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {exercises.map((exercise, index) => (
                            <Card key={index} className="flex flex-col">
                                <img 
                                    src={exercise.imageUrl} 
                                    alt={`${exercise.name} egzersizi`}
                                    className="w-full h-48 object-cover rounded-lg mb-4 bg-slate-700"
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.onerror = null; // prevent infinite loop
                                        target.src = 'https://via.placeholder.com/500x300.png?text=G%C3%B6rsel+Y%C3%BCklenemedi';
                                    }}
                                />
                                <h3 className="text-xl font-bold text-blue-400 mb-2">{exercise.name}</h3>
                                
                                <a 
                                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(exercise.name + " nasıl yapılır")}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-white bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors mb-4 w-fit shadow-md shadow-red-900/20"
                                >
                                    <PlayIcon />
                                    Video Anlatımı İzle
                                </a>

                                <p className="text-slate-300 mb-4 flex-grow">{exercise.description}</p>
                                
                                <div className="border-t border-slate-700 pt-4 mt-auto">
                                    <h4 className="font-semibold text-white mb-3">Püf Noktaları</h4>
                                    <ul className="space-y-2">
                                        {exercise.keyPoints.map((point, i) => (
                                            <li key={i} className="flex items-start gap-2">
                                                <CheckCircleIcon />
                                                <span className="text-slate-400 text-sm">{point}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};