
import React, { useState, useEffect, useCallback } from 'react';
import type { UserProfile, LoggedExercise } from '../types';
import Card from './shared/Card';

const Label: React.FC<{ htmlFor: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-300 mb-2">{children}</label>
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input {...props} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
    <select {...props} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
);


interface ProfileProps {
  userProfile: UserProfile;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  savedWorkouts: Record<string, LoggedExercise[]>;
  setSavedWorkouts: React.Dispatch<React.SetStateAction<Record<string, LoggedExercise[]>>>;
  onLogout: () => void;
  currentUserEmail: string;
}

const Profile: React.FC<ProfileProps> = ({ userProfile, setUserProfile, savedWorkouts, setSavedWorkouts, onLogout, currentUserEmail }) => {
    const [formData, setFormData] = useState<UserProfile>(userProfile);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    
    useEffect(() => {
        setFormData(userProfile);
    }, [userProfile]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveProfile = (e: React.FormEvent) => {
        e.preventDefault();
        setSaveStatus('saving');
        setUserProfile(formData);
        setTimeout(() => {
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }, 500);
    };

    const handleDeleteWorkout = useCallback((category: string, exerciseId: string) => {
        setSavedWorkouts(prevLogs => {
            const newLogs = { ...prevLogs };
            const updatedCategoryLogs = (newLogs[category] || []).filter(ex => ex.id !== exerciseId);
            
            if (updatedCategoryLogs.length === 0) {
                delete newLogs[category];
            } else {
                newLogs[category] = updatedCategoryLogs;
            }
            return newLogs;
        });
    }, [setSavedWorkouts]);

    const hasSavedWorkouts = Object.values(savedWorkouts).some((cat: LoggedExercise[]) => cat.length > 0);

    return (
        <div className="animate-fade-in max-w-4xl mx-auto space-y-8">
            <Card>
                <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-white">
                            {userProfile.name ? `Merhaba, ${userProfile.name.split(' ')[0]}` : 'Kullanıcı Profili'}
                        </h2>
                        <p className="text-slate-400 mt-1 text-sm">Hesap: <span className="font-medium text-slate-300">{currentUserEmail}</span></p>
                    </div>
                     <button
                        onClick={onLogout}
                        className="bg-slate-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-500 hover:text-white transition-colors duration-300 flex-shrink-0"
                    >
                        Çıkış Yap
                    </button>
                </div>
                
                <p className="text-slate-400 mb-6 border-t border-slate-800 pt-6">
                    Kişisel bilgilerinizi girerek daha doğru tavsiyeler alın. Bu bilgiler cihazınızda saklanır.
                </p>
                <form onSubmit={handleSaveProfile}>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <Label htmlFor="name">İsim</Label>
                            <Input type="text" name="name" id="name" value={formData.name || ''} onChange={handleChange} placeholder="Adınız Soyadınız" />
                        </div>
                        <div>
                            <Label htmlFor="age">Yaş</Label>
                            <Input type="number" name="age" id="age" value={formData.age} onChange={handleChange} placeholder="Örn: 28" />
                        </div>
                        <div>
                            <Label htmlFor="gender">Cinsiyet</Label>
                            <Select name="gender" id="gender" value={formData.gender} onChange={handleChange}>
                                <option value="male">Erkek</option>
                                <option value="female">Kadın</option>
                                <option value="other">Diğer</option>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="weight">Kilo (kg)</Label>
                            <Input type="number" name="weight" id="weight" value={formData.weight} onChange={handleChange} placeholder="Örn: 75" />
                        </div>
                        <div>
                            <Label htmlFor="height">Boy (cm)</Label>
                            <Input type="number" name="height" id="height" value={formData.height} onChange={handleChange} placeholder="Örn: 180"/>
                        </div>
                        <div>
                            <Label htmlFor="neck">Boyun Çevresi (cm)</Label>
                            <Input type="number" name="neck" id="neck" value={formData.neck || ''} onChange={handleChange} placeholder="Örn: 38" />
                        </div>
                        <div>
                            <Label htmlFor="waist">Bel Çevresi (cm)</Label>
                            <Input type="number" name="waist" id="waist" value={formData.waist || ''} onChange={handleChange} placeholder="Örn: 85" />
                        </div>
                        {formData.gender === 'female' && (
                             <div>
                                <Label htmlFor="hip">Kalça Çevresi (cm)</Label>
                                <Input type="number" name="hip" id="hip" value={formData.hip || ''} onChange={handleChange} placeholder="Örn: 95" />
                            </div>
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={saveStatus !== 'idle'}
                        className="mt-8 w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-500 disabled:bg-blue-400/50 disabled:cursor-not-allowed transition-colors duration-300"
                    >
                        {saveStatus === 'saving' ? 'Kaydediliyor...' : saveStatus === 'saved' ? 'Bilgiler Kaydedildi ✔' : 'Bilgileri Kaydet'}
                    </button>
                </form>
            </Card>

            <Card>
                <h2 className="text-2xl font-bold text-white mb-6">Kaydedilen Antrenmanlar</h2>
                 {!hasSavedWorkouts ? (
                    <div className="text-center py-10 px-4 rounded-lg bg-slate-800/50">
                        <p className="text-slate-400">Henüz kaydedilmiş bir antrenman programınız yok.</p>
                        <p className="text-slate-500 text-sm mt-1">AI Buddy sekmesinden bir program oluşturup kaydedebilirsiniz.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {(Object.entries(savedWorkouts) as [string, LoggedExercise[]][]).map(([category, exercises]) => (
                            exercises.length > 0 && (
                                <div key={category} className="bg-slate-950/50 p-4 rounded-xl">
                                    <h3 className="font-bold text-blue-400 text-lg mb-4 capitalize">{category}</h3>
                                    <div className="space-y-3">
                                        {exercises.map(exercise => (
                                             <details key={exercise.id} className="bg-slate-800/70 p-3 rounded-lg group">
                                                <summary className="flex justify-between items-center cursor-pointer list-none">
                                                    <span className="font-semibold text-white">{exercise.name}</span>
                                                    <div className="flex items-center gap-2">
                                                        <button 
                                                            onClick={(e) => { e.preventDefault(); handleDeleteWorkout(category, exercise.id); }}
                                                            className="text-slate-500 hover:text-red-400 transition-colors duration-200 p-2 rounded-full -m-2 opacity-50 group-hover:opacity-100"
                                                            aria-label={`${exercise.name} egzersizini sil`}
                                                        >
                                                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                           </svg>
                                                        </button>
                                                        <span className="transition-transform duration-300 group-open:rotate-90">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                                        </span>
                                                    </div>
                                                </summary>
                                                <div className="mt-4 pt-4 border-t border-slate-700/50">
                                                    <div className="grid grid-cols-4 gap-x-2 text-xs text-slate-400 font-semibold mb-2 pl-2">
                                                        <span>Set No</span>
                                                        <span>Set Tipi</span>
                                                        <span>Ağırlık</span>
                                                        <span>Tekrar</span>
                                                    </div>
                                                    <ul className="space-y-1">
                                                        {exercise.sets.map((set, i) => {
                                                            const setType = set.type || 'working';
                                                            let typeBadge = '💪 Çalışma';
                                                            let badgeColor = 'text-blue-400 bg-blue-500/10 border border-blue-500/20';
                                                            
                                                            if (setType === 'warmup') {
                                                                typeBadge = '🔥 Isınma';
                                                                badgeColor = 'text-amber-400 bg-amber-500/10 border border-amber-500/20';
                                                            } else if (setType === 'bodyweight') {
                                                                typeBadge = '⚖️ Vücut';
                                                                badgeColor = 'text-teal-400 bg-teal-500/10 border border-teal-500/20';
                                                            } else if (setType === 'drop') {
                                                                typeBadge = '📉 Drop';
                                                                badgeColor = 'text-rose-400 bg-rose-500/10 border border-rose-500/20';
                                                            }

                                                            return (
                                                                <li key={i} className="grid grid-cols-4 gap-x-2 text-xs text-slate-300 bg-slate-700/20 p-2 rounded items-center">
                                                                    <span className="font-semibold text-slate-500 pl-1">{i + 1}.</span>
                                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold text-center w-max ${badgeColor}`}>
                                                                        {typeBadge}
                                                                    </span>
                                                                    <span>{set.weight ? `${set.weight} kg` : '--'}</span>
                                                                    <span>{set.reps ? `${set.reps} Tekrar` : '--'}</span>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                </div>
                                             </details>
                                        ))}
                                    </div>
                                </div>
                            )
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
};

export default Profile;
