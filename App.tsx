
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { NavigationTab, LoggedExercise, UserProfile, Exercise, WaterData } from './types';
import { WorkoutPlanner } from './components/WorkoutPlanner';
import WorkoutLog from './components/WorkoutLog';
import CalorieCalculator from './components/CalorieCalculator';
import AiBuddyChat from './components/NutritionTips';
import MealAnalyzer from './components/MealAnalyzer';
import Profile from './components/Profile';
import Login from './components/Login';
import { DumbbellIcon, CalculatorIcon, ChatIcon, CameraIcon, NotebookIcon, UserIcon, LoginIcon, BodyFatIcon, WaterDropIcon } from './constants';
import { parseWorkoutFromText } from './services/geminiService';
import BodyFatCalculator from './components/BodyFatCalculator';
import WaterTracker from './components/WaterTracker';
import { 
  auth, 
  db, 
  onAuthStateChanged, 
  doc, 
  getDoc, 
  setDoc, 
  signOut,
  handleFirestoreError,
  OperationType
} from './services/firebase';
import Spinner from './components/shared/Spinner';

const initialProfile: UserProfile = { name: '', age: '', weight: '', height: '', gender: 'male', neck: '', waist: '', hip: '' };
const initialLogs: Record<string, LoggedExercise[]> = {};
const initialWaterData: WaterData = { goal: 2500, log: {}, reminderEnabled: false, reminderInterval: 60 };

const App: React.FC = () => {
    const [currentUser, setCurrentUser] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<NavigationTab>(NavigationTab.WORKOUTS);
    const [authLoading, setAuthLoading] = useState(true);
    const [hasLoadedFromDb, setHasLoadedFromDb] = useState(false);
    
    // User-specific data states
    const [userProfile, setUserProfile] = useState<UserProfile>(initialProfile);
    const [logs, setLogs] = useState<Record<string, LoggedExercise[]>>(initialLogs);
    const [waterData, setWaterData] = useState<WaterData>(initialWaterData);

    // On initial load, setup the Firebase auth listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setCurrentUser(user.uid);
                setUserEmail(user.email);
                
                try {
                    const userRef = doc(db, 'users', user.uid);
                    let userDoc;
                    try {
                        userDoc = await getDoc(userRef);
                    } catch (error) {
                        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
                    }
                    
                    if (userDoc && userDoc.exists()) {
                        const data = userDoc.data();
                        setUserProfile(data.profile || initialProfile);
                        setLogs(data.logs || initialLogs);
                        setWaterData({ ...initialWaterData, ...(data.waterData || {}) });

                        // Update our offline local storage backup
                        try {
                            localStorage.setItem(`gym_buddy_backup_${user.uid}`, JSON.stringify({
                                profile: data.profile || initialProfile,
                                logs: data.logs || initialLogs,
                                waterData: data.waterData || initialWaterData
                            }));
                        } catch (e) {
                            console.error("Failed to save local offline backup:", e);
                        }
                    } else {
                        // Initialize document for a new user
                        try {
                            await setDoc(userRef, {
                                profile: initialProfile,
                                logs: initialLogs,
                                waterData: initialWaterData
                            });
                        } catch (error) {
                            handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
                        }
                        setUserProfile(initialProfile);
                        setLogs(initialLogs);
                        setWaterData(initialWaterData);

                        // Also update backup
                        try {
                            localStorage.setItem(`gym_buddy_backup_${user.uid}`, JSON.stringify({
                                profile: initialProfile,
                                logs: initialLogs,
                                waterData: initialWaterData
                            }));
                        } catch (e) {
                            console.error("Failed to save initial local backup:", e);
                        }
                    }
                    setHasLoadedFromDb(true);
                    
                    // Redirect to profile only if they were stuck on login
                    setActiveTab(prev => prev === NavigationTab.LOGIN ? NavigationTab.PROFILE : prev);
                } catch (error) {
                    if (error instanceof Error && error.message.startsWith('{"error":')) {
                        throw error;
                    }
                    const isOfflineError = error instanceof Error && 
                        (error.message.includes('offline') || error.message.includes('client is offline'));
                    
                    if (isOfflineError) {
                        console.warn("Firestore is offline, falling back to local offline backup:", error.message);
                    } else {
                        console.error("Failed to load user data from Firestore:", error);
                    }
                    
                    // Offline / transient error fallback: Load from local backup
                    try {
                        const backupStr = localStorage.getItem(`gym_buddy_backup_${user.uid}`);
                        if (backupStr) {
                            const backupData = JSON.parse(backupStr);
                            setUserProfile(backupData.profile || initialProfile);
                            setLogs(backupData.logs || initialLogs);
                            setWaterData({ ...initialWaterData, ...(backupData.waterData || {}) });
                            console.log("Loaded user data from local offline backup.");
                        } else {
                            // No backup exists yet, initialize with defaults so user is not blocked
                            setUserProfile(initialProfile);
                            setLogs(initialLogs);
                            setWaterData(initialWaterData);
                        }
                    } catch (backupError) {
                        console.error("Failed to load local backup:", backupError);
                        setUserProfile(initialProfile);
                        setLogs(initialLogs);
                        setWaterData(initialWaterData);
                    }
                    
                    // Treat as loaded to allow fully offline functionality
                    setHasLoadedFromDb(true);
                    setActiveTab(prev => prev === NavigationTab.LOGIN ? NavigationTab.PROFILE : prev);
                }
            } else {
                setCurrentUser(null);
                setUserEmail(null);
                setUserProfile(initialProfile);
                setLogs(initialLogs);
                setWaterData(initialWaterData);
                setHasLoadedFromDb(false);
            }
            setAuthLoading(false);
        });

        return () => unsubscribe();
    }, []);
    
    // Handle Notification Interval
    useEffect(() => {
        if (!waterData.reminderEnabled || !("Notification" in window)) {
            return;
        }

        let timerId: number | undefined;

        const triggerNotification = () => {
            const title = "Gym Buddy: Su İçme Zamanı! 💧";
            const options = {
                body: "Hedefine ulaşmak için bir bardak su içmeyi unutma.",
                icon: "/favicon.ico"
            };

            if (Notification.permission === 'granted') {
                 new Notification(title, options);
            }
        };

        const startTimer = () => {
            const intervalMs = waterData.reminderInterval * 60 * 1000;
            // Clear any existing timer just in case
            if (timerId) window.clearInterval(timerId);
            timerId = window.setInterval(triggerNotification, intervalMs);
        };

        const setupNotifications = async () => {
            // Only start timer if already granted. We rely on WaterTracker component to request permission via user gesture.
            if (Notification.permission === 'granted') {
                startTimer();
            }
        };

        setupNotifications();

        return () => {
            if (timerId) window.clearInterval(timerId);
        };
    }, [waterData.reminderEnabled, waterData.reminderInterval]);


    // Save data to Firestore with debounce when changes occur
    useEffect(() => {
        if (!currentUser || !hasLoadedFromDb) return;
        
        // Save locally immediately to guarantee no data loss even if connection is offline
        try {
            localStorage.setItem(`gym_buddy_backup_${currentUser}`, JSON.stringify({
                profile: userProfile,
                logs: logs,
                waterData: waterData
            }));
        } catch (e) {
            console.error("Failed to save local backup on change:", e);
        }
        
        const saveToDb = async () => {
            try {
                const userRef = doc(db, 'users', currentUser);
                try {
                    await setDoc(userRef, {
                        profile: userProfile,
                        logs: logs,
                        waterData: waterData
                    }, { merge: true });
                } catch (error) {
                    handleFirestoreError(error, OperationType.WRITE, `users/${currentUser}`);
                }
            } catch (error) {
                if (error instanceof Error && error.message.startsWith('{"error":')) {
                    throw error;
                }
                const isOfflineError = error instanceof Error && 
                    (error.message.includes('offline') || error.message.includes('client is offline'));
                if (isOfflineError) {
                    console.warn("Firestore is offline, saving locally. Will sync with cloud once online.");
                } else {
                    console.error("Failed to save data to Firestore:", error);
                }
            }
        };

        const timeoutId = setTimeout(saveToDb, 1000);
        return () => clearTimeout(timeoutId);
    }, [userProfile, logs, waterData, currentUser, hasLoadedFromDb]);

    const handleLoginSuccess = useCallback((email: string) => {
        setActiveTab(NavigationTab.PROFILE);
    }, []);

    const handleLogout = useCallback(async () => {
        try {
            await signOut(auth);
            setActiveTab(NavigationTab.WORKOUTS);
        } catch (error) {
            console.error("Failed during logout:", error);
        }
    }, []);



    const handleSaveWorkout = useCallback(async (text: string) => {
        try {
            const parsedData = await parseWorkoutFromText(text);
            if (parsedData && parsedData.category && parsedData.exercises) {
                setLogs(prevLogs => {
                    const newLogs = { ...prevLogs };
                    const categoryLogs = newLogs[parsedData.category] || [];
                    const newExercises = parsedData.exercises.map(ex => ({
                        ...ex,
                        id: Date.now().toString() + Math.random(), // unique id
                    }));
                    newLogs[parsedData.category] = [...categoryLogs, ...newExercises];
                    return newLogs;
                });
                setActiveTab(NavigationTab.WORKOUT_LOG);
            }
        } catch (error) {
            console.error("Failed to parse and save workout:", error);
        }
    }, []);
    
    const handleSavePlanFromPlanner = useCallback((exercisesToSave: Exercise[], category: string) => {
        setLogs(prevLogs => {
            const newLogs = { ...prevLogs };
            const categoryLogs = newLogs[category] || [];
            const existingNames = new Set(categoryLogs.map(ex => ex.name));

            const newExercises: LoggedExercise[] = exercisesToSave
                .filter(ex => !existingNames.has(ex.name))
                .map(ex => ({
                    id: Date.now().toString() + Math.random(),
                    name: ex.name,
                    sets: [{ weight: '', reps: '' }], // Start with one empty set
                }));
            
            if (newExercises.length > 0) {
                 newLogs[category] = [...categoryLogs, ...newExercises];
            }
           
            return newLogs;
        });
        
        setActiveTab(NavigationTab.WORKOUT_LOG);
    }, [setActiveTab]);


    const renderContent = () => {
        if (authLoading) {
            return (
                <div className="flex flex-col justify-center items-center py-20">
                    <Spinner />
                    <p className="text-slate-400 mt-4 text-sm animate-pulse">Verileriniz yükleniyor...</p>
                </div>
            );
        }

        switch (activeTab) {
            case NavigationTab.WORKOUTS:
                return <WorkoutPlanner 
                    isLoggedIn={currentUser !== null}
                    onSavePlan={handleSavePlanFromPlanner}
                    onLoginRedirect={() => setActiveTab(NavigationTab.LOGIN)}
                />;
            case NavigationTab.WORKOUT_LOG:
                return <WorkoutLog logs={logs} setLogs={setLogs} userProfile={userProfile} setUserProfile={setUserProfile} />;
            case NavigationTab.WATER_TRACKER:
                return <WaterTracker waterData={waterData} setWaterData={setWaterData} />;
            case NavigationTab.CALORIE_CALCULATOR:
                return <CalorieCalculator userProfile={userProfile} />;
            case NavigationTab.BODY_FAT_CALCULATOR:
                return <BodyFatCalculator 
                    userProfile={userProfile} 
                    onProfileRedirect={() => setActiveTab(NavigationTab.PROFILE)} 
                />;
            case NavigationTab.AI_COACH:
                return <AiBuddyChat 
                    onSaveWorkout={handleSaveWorkout} 
                    userProfile={userProfile}
                    isLoggedIn={currentUser !== null}
                />;
            case NavigationTab.MEAL_ANALYZER:
                return <MealAnalyzer />;
            case NavigationTab.PROFILE:
                 if (!currentUser) {
                    setActiveTab(NavigationTab.LOGIN);
                    return null;
                }
                return <Profile userProfile={userProfile} setUserProfile={setUserProfile} savedWorkouts={logs} setSavedWorkouts={setLogs} onLogout={handleLogout} currentUserEmail={userEmail || ''} />;
            case NavigationTab.LOGIN:
                return <Login onLoginSuccess={handleLoginSuccess} />;
            default:
                return <WorkoutPlanner 
                    isLoggedIn={currentUser !== null}
                    onSavePlan={handleSavePlanFromPlanner}
                    onLoginRedirect={() => setActiveTab(NavigationTab.LOGIN)}
                />;
        }
    };

    const navItems = useMemo(() => [
        { id: NavigationTab.WORKOUTS, label: 'Egzersizler', icon: <DumbbellIcon /> },
        { id: NavigationTab.WORKOUT_LOG, label: 'Not Defteri', icon: <NotebookIcon /> },
        { id: NavigationTab.WATER_TRACKER, label: 'Su Takibi', icon: <WaterDropIcon /> },
        { id: NavigationTab.CALORIE_CALCULATOR, label: 'Kalori', icon: <CalculatorIcon /> },
        { id: NavigationTab.BODY_FAT_CALCULATOR, label: 'Vücut Yağı', icon: <BodyFatIcon /> },
        { id: NavigationTab.MEAL_ANALYZER, label: 'Yemek Analizi', icon: <CameraIcon /> },
        { id: NavigationTab.AI_COACH, label: 'AI Buddy', icon: <ChatIcon /> },
        currentUser !== null
            ? { id: NavigationTab.PROFILE, label: 'Profil', icon: <UserIcon /> }
            : { id: NavigationTab.LOGIN, label: 'Giriş Yap', icon: <LoginIcon /> },
    ], [currentUser]);

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center p-4 sm:p-6 lg:p-8">
            <header className="w-full max-w-6xl mb-8 flex justify-center items-center">
                <div className="text-center">
                    <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                        Gym Buddy
                    </h1>
                    <p className="mt-1 text-lg text-blue-400">AI Fitness & Beslenme Asistanı</p>
                </div>
            </header>

            <nav className="w-full max-w-lg bg-slate-900/60 backdrop-blur-sm p-2 rounded-xl mb-8 flex justify-center items-center gap-1 sm:gap-2 shadow-lg">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        disabled={authLoading}
                        className={`flex-1 flex flex-col sm:flex-row justify-center items-center gap-2 px-2 sm:px-3 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                            activeTab === item.id 
                                ? 'bg-blue-600 text-white shadow-md' 
                                : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`}
                        title={item.label}
                    >
                        {item.icon}
                        <span className="hidden sm:inline">{item.label}</span>
                    </button>
                ))}
            </nav>

            <main className="w-full max-w-6xl flex-grow">
                {renderContent()}
            </main>
            
            <footer className="w-full max-w-6xl text-center mt-12 py-4 border-t border-slate-800">
                <p className="text-slate-500 text-sm">Gym Buddy © 2024 - Tüm Hakları Saklıdır.</p>
            </footer>
        </div>
    );
};

export default App;
