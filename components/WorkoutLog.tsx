import React, { useState, useCallback, useMemo } from 'react';
import { MUSCLE_GROUPS } from '../constants';
import type { LoggedExercise, SetLog, UserProfile } from '../types';
import Card from './shared/Card';

interface WorkoutLogProps {
    logs: Record<string, LoggedExercise[]>;
    setLogs: React.Dispatch<React.SetStateAction<Record<string, LoggedExercise[]>>>;
    userProfile: UserProfile;
    setUserProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
}

const WorkoutLog: React.FC<WorkoutLogProps> = ({ logs, setLogs, userProfile, setUserProfile }) => {
    const [selectedCategory, setSelectedCategory] = useState<string>(MUSCLE_GROUPS[1]);
    const [newExerciseName, setNewExerciseName] = useState<string>('');
    const [bodyWeight, setBodyWeight] = useState<string>(userProfile.weight || '');
    const [isSavingWeight, setIsSavingWeight] = useState<boolean>(false);
    const [weightSaveSuccess, setWeightSaveSuccess] = useState<boolean>(false);

    // Track target working weights for the smart warmup generator on a per-exercise basis
    const [warmupTargets, setWarmupTargets] = useState<Record<string, string>>({});
    const [searchQuery, setSearchQuery] = useState<string>('');

    const handleSaveBodyWeight = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (!bodyWeight.trim()) return;
        setIsSavingWeight(true);
        setUserProfile(prev => ({
            ...prev,
            weight: bodyWeight.trim()
        }));
        setTimeout(() => {
            setIsSavingWeight(false);
            setWeightSaveSuccess(true);
            setTimeout(() => setWeightSaveSuccess(false), 2000);
        }, 600);
    }, [bodyWeight, setUserProfile]);
    
    const handleAddExercise = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = newExerciseName.trim();
        if (!trimmedName) return;

        const newExercise: LoggedExercise = {
            id: Date.now().toString(),
            name: trimmedName,
            sets: [{ weight: '', reps: '', type: 'working' }]
        };

        setLogs(prevLogs => {
            const categoryLogs = prevLogs[selectedCategory] || [];
            return {
                ...prevLogs,
                [selectedCategory]: [...categoryLogs, newExercise]
            };
        });
        setNewExerciseName('');
    }, [newExerciseName, selectedCategory, setLogs]);
    
    const handleDeleteExercise = useCallback((categoryId: string, exerciseId: string) => {
         setLogs(prevLogs => {
            const categoryLogs = (prevLogs[categoryId] || []).filter(ex => ex.id !== exerciseId);
            return { ...prevLogs, [categoryId]: categoryLogs };
        });
    }, [setLogs]);

    const handleAddSet = useCallback((categoryId: string, exerciseId: string, type: 'warmup' | 'working' | 'bodyweight' | 'drop' = 'working') => {
        setLogs(prevLogs => {
            const categoryLogs = (prevLogs[categoryId] || []).map(ex => {
                if (ex.id === exerciseId) {
                    const defaultWeight = type === 'bodyweight' ? (userProfile.weight || '') : '';
                    return { ...ex, sets: [...ex.sets, { weight: defaultWeight, reps: '', type }] };
                }
                return ex;
            });
            return { ...prevLogs, [categoryId]: categoryLogs };
        });
    }, [setLogs, userProfile.weight]);

    const handleLogChange = useCallback((categoryId: string, exerciseId: string, setIndex: number, field: keyof SetLog, value: string) => {
        setLogs(prevLogs => {
            const categoryLogs = (prevLogs[categoryId] || []).map(ex => {
                if (ex.id === exerciseId) {
                    const updatedSets = [...ex.sets];
                    if (updatedSets[setIndex]) {
                       const originalSet = updatedSets[setIndex];
                       let updatedSet = { ...originalSet, [field]: value };
                       
                       // Auto pre-fill user weight if switching to bodyweight type
                       if (field === 'type' && value === 'bodyweight') {
                           updatedSet.weight = userProfile.weight || '';
                       }
                       
                       updatedSets[setIndex] = updatedSet as SetLog;
                    }
                    return { ...ex, sets: updatedSets };
                }
                return ex;
            });
            return { ...prevLogs, [categoryId]: categoryLogs };
        });
    }, [setLogs, userProfile.weight]);

    const handleDeleteSet = useCallback((categoryId: string, exerciseId: string, setIndex: number) => {
        setLogs(prevLogs => {
            const categoryLogs = (prevLogs[categoryId] || []).map(ex => {
                if (ex.id === exerciseId) {
                    const filteredSets = ex.sets.filter((_, index) => index !== setIndex);
                    return { ...ex, sets: filteredSets };
                }
                return ex;
            });
            return { ...prevLogs, [categoryId]: categoryLogs };
        });
    }, [setLogs]);

    // Smart Warmup Generator: Instantly prepends 3 progressive warmup sets
    const handleGenerateWarmup = useCallback((exerciseId: string) => {
        const targetStr = warmupTargets[exerciseId] || '';
        const targetWeight = parseFloat(targetStr);
        if (isNaN(targetWeight) || targetWeight <= 0) return;

        // Standard progressive warmup protocol:
        // Set 1: 50% target weight x 10 reps
        // Set 2: 70% target weight x 6 reps
        // Set 3: 90% target weight x 2 reps (acclimation set, not fatiguing)
        const warmupSets: SetLog[] = [
            {
                weight: Math.round(targetWeight * 0.5).toString(),
                reps: '10',
                type: 'warmup'
            },
            {
                weight: Math.round(targetWeight * 0.7).toString(),
                reps: '6',
                type: 'warmup'
            },
            {
                weight: Math.round(targetWeight * 0.9).toString(),
                reps: '2',
                type: 'warmup'
            }
        ];

        setLogs(prevLogs => {
            const categoryLogs = (prevLogs[selectedCategory] || []).map(ex => {
                if (ex.id === exerciseId) {
                    return {
                        ...ex,
                        sets: [...warmupSets, ...ex.sets]
                    };
                }
                return ex;
            });
            return { ...prevLogs, [selectedCategory]: categoryLogs };
        });

        // Clear targets
        setWarmupTargets(prev => ({ ...prev, [exerciseId]: '' }));
    }, [warmupTargets, selectedCategory, setLogs]);

    const currentExercises = logs[selectedCategory] || [];

    const filteredExercises = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return currentExercises;
        return currentExercises.filter(ex => ex.name.toLowerCase().includes(query));
    }, [currentExercises, searchQuery]);

    const otherCategoryMatches = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return [];
        
        const matches: { category: string; count: number }[] = [];
        Object.entries(logs).forEach(([category, exercises]) => {
            if (category === selectedCategory) return;
            const count = exercises.filter(ex => ex.name.toLowerCase().includes(query)).length;
            if (count > 0) {
                matches.push({ category, count });
            }
        });
        return matches;
    }, [logs, selectedCategory, searchQuery]);

    return (
        <div className="animate-fade-in max-w-4xl mx-auto space-y-6">
            
            {/* Top Row: General info + Dynamic User Weight Tracker */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2 flex flex-col justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-2">Antrenman Not Defteri</h2>
                        <p className="text-slate-400 text-sm">
                            Gelişmiş set takip sistemiyle egzersizlerinizi, ısınma (warmup) setlerinizi, vücut ağırlığı hareketlerinizi ve drop setlerinizi detaylıca planlayın.
                        </p>
                    </div>
                </Card>

                <Card className="border border-slate-700/40 bg-slate-800/20">
                    <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                        <span className="text-lg">⚖️</span> Güncel Vücut Ağırlığınız
                    </h3>
                    <form onSubmit={handleSaveBodyWeight} className="flex gap-2">
                        <div className="relative flex-1">
                            <input
                                type="number"
                                step="0.1"
                                placeholder="Örn: 75.5"
                                value={bodyWeight}
                                onChange={(e) => setBodyWeight(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 pr-8 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                            />
                            <span className="absolute right-3 top-2 text-xs text-slate-500 font-medium">kg</span>
                        </div>
                        <button
                            type="submit"
                            disabled={isSavingWeight || !bodyWeight}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 shadow-sm flex items-center justify-center min-w-[70px] ${
                                weightSaveSuccess
                                    ? 'bg-green-600 text-white'
                                    : 'bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50'
                            }`}
                        >
                            {isSavingWeight ? '...' : weightSaveSuccess ? '✔' : 'Kaydet'}
                        </button>
                    </form>
                    <p className="text-[11px] text-slate-500 mt-2">
                        Vücut ağırlığı hareketlerinde set ağırlığı olarak otomatik doldurma için kullanılır.
                    </p>
                </Card>
            </div>

            {/* Muscle Group Categorization */}
            <Card>
                <div className="grid grid-cols-3 sm:grid-cols-9 gap-2">
                    {MUSCLE_GROUPS.map((muscle) => (
                        <button
                            key={muscle}
                            onClick={() => setSelectedCategory(muscle)}
                            className={`px-2 py-2 text-xs font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                selectedCategory === muscle
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                            }`}
                        >
                            {muscle}
                        </button>
                    ))}
                </div>
            </Card>

            {/* Selected Category Exercises */}
            <Card>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-700/50">
                    <div>
                        <h3 className="text-xl font-bold text-blue-400 capitalize">{selectedCategory} Antrenmanı</h3>
                        <p className="text-xs text-slate-500 mt-1">Bu kas grubu için antrenman kayıtlarınızı girin.</p>
                    </div>
                    
                    <form onSubmit={handleAddExercise} className="flex gap-2 w-full sm:w-auto">
                        <input 
                            type="text"
                            value={newExerciseName}
                            onChange={(e) => setNewExerciseName(e.target.value)}
                            placeholder="Yeni Egzersiz Ekle (Örn: Bench Press)"
                            className="flex-grow sm:w-64 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                        />
                        <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors duration-200 whitespace-nowrap">
                            Ekle
                        </button>
                    </form>
                </div>

                {/* Arama Çubuğu */}
                <div className="mb-6 space-y-3">
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Egzersizlerde ara... (Örn: Bench Press)"
                            className="w-full bg-slate-800 border border-slate-700/60 rounded-xl pl-10 pr-10 py-2.5 text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white transition-colors"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {/* Diğer kategorilerdeki sonuçların gösterimi */}
                    {otherCategoryMatches.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-800/30 rounded-lg border border-slate-700/30 text-xs text-slate-400">
                            <span className="font-semibold text-slate-300">💡 Diğer kas gruplarında da eşleşen egzersizler var:</span>
                            {otherCategoryMatches.map(({ category, count }) => (
                                <button
                                    key={category}
                                    onClick={() => {
                                        setSelectedCategory(category);
                                    }}
                                    className="bg-slate-700/50 hover:bg-blue-600/20 text-slate-300 hover:text-blue-400 px-2 py-1 rounded border border-slate-600/30 hover:border-blue-500/30 transition-all font-medium flex items-center gap-1.5"
                                >
                                    <span>{category}</span>
                                    <span className="bg-slate-800 text-[10px] px-1 py-0.2 rounded font-bold text-slate-400">{count}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    {filteredExercises.length === 0 ? (
                        searchQuery ? (
                            <div className="text-center py-12 px-4 rounded-xl bg-slate-800/20 border border-slate-700/20 animate-fade-in">
                                <span className="text-3xl block mb-2">🔍</span>
                                <p className="text-slate-400 text-sm font-medium">"{searchQuery}" araması için bu kategoride bir sonuç bulunamadı.</p>
                                {otherCategoryMatches.length > 0 ? (
                                    <p className="text-slate-500 text-xs mt-2">
                                        Eşleşen sonuçları görmek için yukarıdaki önerilen kas gruplarına tıklayabilirsiniz.
                                    </p>
                                ) : (
                                    <div className="mt-4 flex justify-center">
                                        <button
                                            onClick={() => {
                                                setNewExerciseName(searchQuery);
                                                setSearchQuery('');
                                            }}
                                            className="bg-blue-600/10 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/20 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                                        >
                                            <span>➕</span>
                                            <span>"{searchQuery}" Egzersizini Bu Kategoriye Ekle</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-12 px-4 rounded-xl bg-slate-800/20 border border-slate-700/20 animate-fade-in">
                                <span className="text-3xl block mb-2">🏋️‍♂️</span>
                                <p className="text-slate-400 text-sm font-medium">Bu kategori için henüz egzersiz eklenmedi.</p>
                                <p className="text-slate-500 text-xs mt-1">Yukarıdaki alandan yeni bir egzersiz ekleyerek hemen başlayın.</p>
                            </div>
                        )
                    ) : (
                        filteredExercises.map(exercise => (
                        <div key={exercise.id} className="bg-slate-800/40 border border-slate-700/30 p-5 rounded-xl shadow-sm space-y-4">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-700/20">
                               <h4 className="font-bold text-white text-base flex items-center gap-2">
                                  <span className="w-1.5 h-4 bg-blue-500 rounded-full"></span>
                                  {exercise.name}
                               </h4>
                               <button 
                                    onClick={() => handleDeleteExercise(selectedCategory, exercise.id)}
                                    className="text-slate-500 hover:text-red-400 transition-colors duration-200 p-1.5 rounded-full hover:bg-red-500/10 focus:outline-none"
                                    title="Egzersizi Sil"
                                >
                                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                   </svg>
                               </button>
                            </div>
                            
                            {/* Dynamic Smart Warmup Calculator widget inside the exercise card */}
                            <div className="bg-amber-600/5 border border-amber-500/20 rounded-lg p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                                        <span>🔥</span>
                                        <span>Akıllı Isınma Seti Oluşturucu</span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                        Çalışma ağırlığınızı girin; piramit sistemine göre 3 aşamalı (50%-70%-90%) ısınma setlerini otomatik hesaplayıp ekleyelim.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 w-full md:w-auto">
                                    <div className="relative w-full md:w-28">
                                        <input
                                            type="number"
                                            placeholder="Çalışma (kg)"
                                            value={warmupTargets[exercise.id] || ''}
                                            onChange={(e) => setWarmupTargets(prev => ({ ...prev, [exercise.id]: e.target.value }))}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                                        />
                                        <span className="absolute right-2 top-2 text-[10px] text-slate-500">kg</span>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={!warmupTargets[exercise.id]}
                                        onClick={() => handleGenerateWarmup(exercise.id)}
                                        className="bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white px-3 py-1.5 rounded text-xs font-semibold border border-amber-600/30 transition-all duration-300 disabled:opacity-50 whitespace-nowrap"
                                    >
                                        Setleri Oluştur ve Ekle
                                    </button>
                                </div>
                            </div>
                            
                            <div className="space-y-2.5">
                                {exercise.sets.length > 0 && (
                                    <div className="grid grid-cols-12 gap-2 text-[11px] text-slate-400 font-semibold tracking-wider uppercase pl-1">
                                        <div className="col-span-1 text-center">No</div>
                                        <div className="col-span-4">Set Tipi</div>
                                        <div className="col-span-3">Ağırlık (kg)</div>
                                        <div className="col-span-3">Tekrar</div>
                                        <div className="col-span-1"></div>
                                    </div>
                                )}
                                
                                {exercise.sets.map((log, setIndex) => {
                                    // Style specific to different set types for premium presentation
                                    const setType = log.type || 'working';
                                    let borderStyle = 'border-slate-700/50 bg-slate-800/30';
                                    let labelColor = 'text-blue-400';
                                    let typeText = 'Çalışma';

                                    if (setType === 'warmup') {
                                        borderStyle = 'border-amber-500/20 bg-amber-500/5';
                                        labelColor = 'text-amber-400';
                                        typeText = 'Isınma';
                                    } else if (setType === 'bodyweight') {
                                        borderStyle = 'border-teal-500/20 bg-teal-500/5';
                                        labelColor = 'text-teal-400';
                                        typeText = 'Vücut Ağ.';
                                    } else if (setType === 'drop') {
                                        borderStyle = 'border-rose-500/20 bg-rose-500/5';
                                        labelColor = 'text-rose-400';
                                        typeText = 'Drop Set';
                                    }

                                    return (
                                        <div key={setIndex} className={`grid grid-cols-12 gap-2 items-center p-1.5 rounded-lg border ${borderStyle} transition-all duration-200`}>
                                            <div className="col-span-1 text-center text-xs font-semibold text-slate-500">
                                                {setIndex + 1}
                                            </div>
                                            
                                            {/* Set Type Dropdown Selector */}
                                            <div className="col-span-4">
                                                <select
                                                    value={setType}
                                                    onChange={(e) => handleLogChange(selectedCategory, exercise.id, setIndex, 'type', e.target.value)}
                                                    className={`w-full bg-slate-900/60 border border-slate-700 rounded-md py-1 px-1.5 text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors ${labelColor}`}
                                                >
                                                    <option value="working" className="text-blue-400 bg-slate-900">💪 Çalışma Seti</option>
                                                    <option value="warmup" className="text-amber-400 bg-slate-900">🔥 Isınma Seti</option>
                                                    <option value="bodyweight" className="text-teal-400 bg-slate-900">⚖️ Vücut Ağırlığı</option>
                                                    <option value="drop" className="text-rose-400 bg-slate-900">📉 Drop Set</option>
                                                </select>
                                            </div>

                                            {/* Weight Input */}
                                            <div className="col-span-3">
                                                <div className="relative">
                                                    <input 
                                                        type="number"
                                                        placeholder={setType === 'bodyweight' ? (userProfile.weight || '--') : '--'}
                                                        value={log.weight}
                                                        onChange={(e) => handleLogChange(selectedCategory, exercise.id, setIndex, 'weight', e.target.value)}
                                                        className="w-full bg-slate-900/60 border border-slate-700 rounded-md py-1 px-2 text-white text-xs focus:ring-1 focus:ring-blue-500 transition appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                        aria-label={`${setIndex + 1}. set ağırlık`}
                                                    />
                                                    {setType === 'bodyweight' && !log.weight && userProfile.weight && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleLogChange(selectedCategory, exercise.id, setIndex, 'weight', userProfile.weight || '')}
                                                            className="absolute inset-0 flex items-center justify-center bg-slate-900/90 text-[10px] text-teal-400 hover:text-white font-medium rounded-md border border-teal-500/30 transition-colors"
                                                            title="Kullanıcı ağırlığını doldur"
                                                        >
                                                            {userProfile.weight} kg
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Reps Input */}
                                            <div className="col-span-3">
                                                <input 
                                                    type="number"
                                                    placeholder="--"
                                                    value={log.reps}
                                                    onChange={(e) => handleLogChange(selectedCategory, exercise.id, setIndex, 'reps', e.target.value)}
                                                    className="w-full bg-slate-900/60 border border-slate-700 rounded-md py-1 px-2 text-white text-xs focus:ring-1 focus:ring-blue-500 transition appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                    aria-label={`${setIndex + 1}. set tekrar`}
                                                />
                                            </div>

                                            {/* Delete Set */}
                                            <div className="col-span-1 text-center">
                                                <button 
                                                    onClick={() => handleDeleteSet(selectedCategory, exercise.id, setIndex)}
                                                    className="text-slate-500 hover:text-red-400 transition-colors duration-200 p-1 rounded-full hover:bg-slate-700/50 focus:outline-none"
                                                    aria-label={`${setIndex + 1}. seti sil`}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                
                                {/* Quick set-adding presets bar */}
                                <div className="flex flex-wrap items-center gap-2 pt-2">
                                    <button 
                                        onClick={() => handleAddSet(selectedCategory, exercise.id, 'working')}
                                        className="flex-1 min-w-[100px] px-3 py-1.5 text-xs font-semibold rounded bg-blue-600/10 text-blue-300 hover:bg-blue-600/25 border border-blue-600/20 transition-all focus:outline-none"
                                    >
                                        + Çalışma Seti
                                    </button>
                                    <button 
                                        onClick={() => handleAddSet(selectedCategory, exercise.id, 'warmup')}
                                        className="flex-1 min-w-[100px] px-3 py-1.5 text-xs font-semibold rounded bg-amber-500/10 text-amber-300 hover:bg-amber-500/25 border border-amber-500/20 transition-all focus:outline-none"
                                    >
                                        + Isınma Seti
                                    </button>
                                    <button 
                                        onClick={() => handleAddSet(selectedCategory, exercise.id, 'bodyweight')}
                                        className="flex-1 min-w-[100px] px-3 py-1.5 text-xs font-semibold rounded bg-teal-500/10 text-teal-300 hover:bg-teal-500/25 border border-teal-500/20 transition-all focus:outline-none"
                                    >
                                        + Vücut Ağırlığı
                                    </button>
                                    <button 
                                        onClick={() => handleAddSet(selectedCategory, exercise.id, 'drop')}
                                        className="flex-1 min-w-[100px] px-3 py-1.5 text-xs font-semibold rounded bg-rose-500/10 text-rose-300 hover:bg-rose-500/25 border border-rose-500/20 transition-all focus:outline-none"
                                    >
                                        + Drop Set
                                    </button>
                                </div>
                            </div>
                        </div>
                    )))}
                </div>
            </Card>
        </div>
    );
};

export default WorkoutLog;
