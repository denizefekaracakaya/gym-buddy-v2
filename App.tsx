import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { NavigationTab, LoggedExercise, UserProfile, Exercise, WaterData } from './types';
import { WorkoutPlanner } from './components/WorkoutPlanner';
import WorkoutLog from './components/WorkoutLog';
import CalorieCalculator from './components/CalorieCalculator';
import AiBuddyChat from './components/NutritionTips';
import MealAnalyzer from './components/MealAnalyzer';
import Profile from './components/Profile';
import Login from './components/Login';
import BodyFatCalculator from './components/BodyFatCalculator';
import WaterTracker from './components/WaterTracker';
import Spinner from './components/shared/Spinner';
import PasswordRecovery from './components/PasswordRecovery';
import {
    DumbbellIcon,
    CalculatorIcon,
    ChatIcon,
    CameraIcon,
    NotebookIcon,
    UserIcon,
    LoginIcon,
    BodyFatIcon,
    WaterDropIcon,
    MoreIcon,
    OfflineIcon,
} from './constants';
import { parseWorkoutFromText } from './services/geminiService';
import { auth } from './services/supabase';
import { emptyUserData } from './services/userData';
import { loadUserData, saveUserData, flushPending } from './services/userSync';
import { isNative, scheduleWaterReminders, cancelWaterReminders, hapticTap } from './services/native';
import { localDateKey } from './lib/date';
import { App as CapApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Keyboard } from '@capacitor/keyboard';

const SAVE_DEBOUNCE_MS = 800;

interface NavItem {
    id: NavigationTab;
    label: string;
    icon: React.ReactNode;
}

const App: React.FC = () => {
    const [currentUser, setCurrentUser] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [activeTab, setActiveTabState] = useState<NavigationTab>(NavigationTab.WORKOUTS);
    const [authLoading, setAuthLoading] = useState(true);
    const [hasLoadedFromDb, setHasLoadedFromDb] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [online, setOnline] = useState(true);
    const [todayKey, setTodayKey] = useState(() => localDateKey());
    const [recoveryMode, setRecoveryMode] = useState(false);
    const [authNotice, setAuthNotice] = useState<string | null>(null);

    const [userProfile, setUserProfile] = useState<UserProfile>(() => emptyUserData().profile);
    const [logs, setLogs] = useState<Record<string, LoggedExercise[]>>({});
    const [waterData, setWaterData] = useState<WaterData>(() => emptyUserData().waterData);

    // Tab history for the Android back button.
    const tabHistory = useRef<NavigationTab[]>([]);
    const setActiveTab = useCallback((tab: NavigationTab) => {
        setActiveTabState((prev) => {
            if (prev !== tab) tabHistory.current = [...tabHistory.current.slice(-19), prev];
            return tab;
        });
        setMoreOpen(false);
        window.scrollTo({ top: 0 });
    }, []);

    // ---------- auth + initial data ----------
    useEffect(() => {
        let loadedFor: string | null = null;
        const applyUser = async (user: { id: string; email?: string | null } | null) => {
            if (user) {
                setCurrentUser(user.id);
                setUserEmail(user.email ?? null);
                if (loadedFor !== user.id) {
                    loadedFor = user.id;
                    const { data } = await loadUserData(user.id);
                    setUserProfile(data.profile);
                    setLogs(data.logs);
                    setWaterData(data.waterData);
                    setHasLoadedFromDb(true);
                    setActiveTabState((prev) => (prev === NavigationTab.LOGIN ? NavigationTab.PROFILE : prev));
                }
            } else {
                loadedFor = null;
                const empty = emptyUserData();
                setCurrentUser(null);
                setUserEmail(null);
                setUserProfile(empty.profile);
                setLogs(empty.logs);
                setWaterData(empty.waterData);
                setHasLoadedFromDb(false);
            }
            setAuthLoading(false);
        };
        // The callback must not await Supabase calls directly (it runs inside the
        // auth lock), so the data load is deferred.
        const { data: sub } = auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
            setTimeout(() => applyUser(session?.user ?? null), 0);
        });
        return () => sub.subscription.unsubscribe();
    }, []);

    // E-mail links (sign-up confirmation, password reset) open the app through
    // io.github.denizefekaracakaya.gymbuddy://auth-callback?code=… (PKCE).
    useEffect(() => {
        if (!isNative) return;
        let remove: (() => void) | undefined;
        CapApp.addListener('appUrlOpen', async ({ url }) => {
            if (!url.startsWith('io.github.denizefekaracakaya.gymbuddy://auth-callback')) return;
            const params = new URL(url.replace('#', '?')).searchParams;
            const code = params.get('code');
            const errorDescription = params.get('error_description');
            if (errorDescription) {
                setAuthNotice('Bağlantı geçersiz veya süresi dolmuş. Lütfen tekrar deneyin.');
                return;
            }
            if (code) {
                const { error } = await auth.exchangeCodeForSession(code);
                setAuthNotice(error ? 'Bağlantı geçersiz veya süresi dolmuş. Lütfen tekrar deneyin.' : 'E-posta adresiniz doğrulandı.');
            }
        }).then((h) => (remove = () => h.remove()));
        return () => remove?.();
    }, []);

    // ---------- persistence ----------
    const latest = useRef({ userProfile, logs, waterData });
    latest.current = { userProfile, logs, waterData };

    const flushSave = useCallback(() => {
        if (!currentUser || !hasLoadedFromDb) return;
        const { userProfile: profile, logs: l, waterData: w } = latest.current;
        saveUserData(currentUser, { profile, logs: l, waterData: w }).catch((error) => {
            console.warn('Cloud save failed; data kept locally:', (error as { code?: string })?.code ?? 'unknown');
        });
    }, [currentUser, hasLoadedFromDb]);

    useEffect(() => {
        if (!currentUser || !hasLoadedFromDb) return;
        const id = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
        return () => clearTimeout(id);
    }, [userProfile, logs, waterData, currentUser, hasLoadedFromDb, flushSave]);

    // ---------- app lifecycle, back button, network ----------
    // Upload changes made while offline as soon as the connection is back.
    useEffect(() => {
        if (online && currentUser && hasLoadedFromDb) flushPending(currentUser).catch(() => undefined);
    }, [online, currentUser, hasLoadedFromDb]);

    const flushRef = useRef(flushSave);
    flushRef.current = flushSave;
    const backRef = useRef<() => void>(() => undefined);
    backRef.current = () => {
        if (moreOpen) {
            setMoreOpen(false);
            return;
        }
        const prev = tabHistory.current.pop();
        if (prev !== undefined) setActiveTabState(prev);
        else CapApp.minimizeApp().catch(() => undefined);
    };

    useEffect(() => {
        const refreshDay = () => setTodayKey(localDateKey());
        const timer = window.setInterval(refreshDay, 60_000);
        const onVisibility = () => document.visibilityState === 'visible' && refreshDay();
        document.addEventListener('visibilitychange', onVisibility);

        const removers: Array<() => void> = [];
        if (isNative) {
            CapApp.addListener('appStateChange', ({ isActive }) => {
                if (isActive) refreshDay();
                else flushRef.current();
            }).then((h) => removers.push(() => h.remove()));
            CapApp.addListener('backButton', () => backRef.current()).then((h) => removers.push(() => h.remove()));
            // Hide the bottom navigation while the on-screen keyboard is open.
            Keyboard.addListener('keyboardWillShow', () => document.body.classList.add('keyboard-open')).then((h) =>
                removers.push(() => h.remove()),
            );
            Keyboard.addListener('keyboardWillHide', () => document.body.classList.remove('keyboard-open')).then((h) =>
                removers.push(() => h.remove()),
            );
            Network.getStatus().then((s) => setOnline(s.connected));
            Network.addListener('networkStatusChange', (s) => setOnline(s.connected)).then((h) =>
                removers.push(() => h.remove()),
            );
        } else {
            const on = () => setOnline(true);
            const off = () => setOnline(false);
            setOnline(navigator.onLine);
            window.addEventListener('online', on);
            window.addEventListener('offline', off);
            removers.push(() => {
                window.removeEventListener('online', on);
                window.removeEventListener('offline', off);
            });
        }
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibility);
            removers.forEach((r) => r());
        };
    }, []);

    // ---------- water reminders ----------
    useEffect(() => {
        if (isNative) {
            const run = waterData.reminderEnabled && currentUser
                ? scheduleWaterReminders(waterData.reminderInterval)
                : cancelWaterReminders();
            run.catch((e) => console.warn('Reminder scheduling failed:', e instanceof Error ? e.message : e));
            return;
        }
        // Web: notify while the page is open (original behaviour).
        if (!waterData.reminderEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
        const id = window.setInterval(() => {
            new Notification('Gym Buddy: Su İçme Zamanı! 💧', {
                body: 'Hedefine ulaşmak için bir bardak su içmeyi unutma.',
            });
        }, waterData.reminderInterval * 60_000);
        return () => window.clearInterval(id);
        // todayKey: reschedule the next 24 h when the day changes / app resumes.
    }, [waterData.reminderEnabled, waterData.reminderInterval, currentUser, todayKey]);

    // ---------- actions ----------
    const handleLoginSuccess = useCallback(() => setActiveTab(NavigationTab.PROFILE), [setActiveTab]);

    const handleLogout = useCallback(async () => {
        try {
            flushSave();
            await cancelWaterReminders().catch(() => undefined);
            await auth.signOut();
            tabHistory.current = [];
            setActiveTabState(NavigationTab.WORKOUTS);
        } catch (error) {
            console.error('Logout failed:', error instanceof Error ? error.message : error);
        }
    }, [flushSave]);

    const handleSaveWorkout = useCallback(
        async (text: string) => {
            const parsedData = await parseWorkoutFromText(text);
            if (!parsedData) throw new Error('Mesajda kaydedilebilir bir antrenman bulunamadı.');
            setLogs((prevLogs) => {
                const categoryLogs = prevLogs[parsedData.category] || [];
                const newExercises = parsedData.exercises.map((ex) => ({
                    ...ex,
                    sets: ex.sets.length ? ex.sets : [{ weight: '', reps: '' }],
                    id: Date.now().toString() + Math.random(),
                }));
                return { ...prevLogs, [parsedData.category]: [...categoryLogs, ...newExercises] };
            });
            setActiveTab(NavigationTab.WORKOUT_LOG);
        },
        [setActiveTab],
    );

    const handleSavePlanFromPlanner = useCallback(
        (exercisesToSave: Exercise[], category: string) => {
            setLogs((prevLogs) => {
                const categoryLogs = prevLogs[category] || [];
                const existingNames = new Set(categoryLogs.map((ex) => ex.name));
                const newExercises: LoggedExercise[] = exercisesToSave
                    .filter((ex) => !existingNames.has(ex.name))
                    .map((ex) => ({
                        id: Date.now().toString() + Math.random(),
                        name: ex.name,
                        sets: [{ weight: '', reps: '' }],
                    }));
                return newExercises.length ? { ...prevLogs, [category]: [...categoryLogs, ...newExercises] } : prevLogs;
            });
            setActiveTab(NavigationTab.WORKOUT_LOG);
        },
        [setActiveTab],
    );

    const goLogin = useCallback(() => setActiveTab(NavigationTab.LOGIN), [setActiveTab]);
    const isLoggedIn = currentUser !== null;

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
            case NavigationTab.WORKOUT_LOG:
                return <WorkoutLog logs={logs} setLogs={setLogs} userProfile={userProfile} setUserProfile={setUserProfile} />;
            case NavigationTab.WATER_TRACKER:
                return (
                    <WaterTracker
                        waterData={waterData}
                        setWaterData={setWaterData}
                        todayKey={todayKey}
                        isLoggedIn={isLoggedIn}
                        onLoginRedirect={goLogin}
                    />
                );
            case NavigationTab.CALORIE_CALCULATOR:
                return <CalorieCalculator userProfile={userProfile} isLoggedIn={isLoggedIn} onLoginRedirect={goLogin} />;
            case NavigationTab.BODY_FAT_CALCULATOR:
                return (
                    <BodyFatCalculator
                        userProfile={userProfile}
                        isLoggedIn={isLoggedIn}
                        onLoginRedirect={goLogin}
                        onProfileRedirect={() => setActiveTab(isLoggedIn ? NavigationTab.PROFILE : NavigationTab.LOGIN)}
                    />
                );
            case NavigationTab.AI_COACH:
                return (
                    <AiBuddyChat
                        onSaveWorkout={handleSaveWorkout}
                        userProfile={userProfile}
                        isLoggedIn={isLoggedIn}
                        onLoginRedirect={goLogin}
                    />
                );
            case NavigationTab.MEAL_ANALYZER:
                return <MealAnalyzer isLoggedIn={isLoggedIn} onLoginRedirect={goLogin} />;
            case NavigationTab.PROFILE:
                if (!isLoggedIn) return <Login onLoginSuccess={handleLoginSuccess} />;
                return (
                    <Profile
                        userProfile={userProfile}
                        setUserProfile={setUserProfile}
                        savedWorkouts={logs}
                        setSavedWorkouts={setLogs}
                        onLogout={handleLogout}
                        currentUserEmail={userEmail || ''}
                    />
                );
            case NavigationTab.LOGIN:
                return isLoggedIn ? null : <Login onLoginSuccess={handleLoginSuccess} />;
            case NavigationTab.WORKOUTS:
            default:
                return <WorkoutPlanner isLoggedIn={isLoggedIn} onSavePlan={handleSavePlanFromPlanner} onLoginRedirect={goLogin} />;
        }
    };

    const accountItem: NavItem = isLoggedIn
        ? { id: NavigationTab.PROFILE, label: 'Profil', icon: <UserIcon /> }
        : { id: NavigationTab.LOGIN, label: 'Giriş Yap', icon: <LoginIcon /> };

    const navItems = useMemo<NavItem[]>(
        () => [
            { id: NavigationTab.WORKOUTS, label: 'Egzersizler', icon: <DumbbellIcon /> },
            { id: NavigationTab.WORKOUT_LOG, label: 'Not Defteri', icon: <NotebookIcon /> },
            { id: NavigationTab.WATER_TRACKER, label: 'Su Takibi', icon: <WaterDropIcon /> },
            { id: NavigationTab.CALORIE_CALCULATOR, label: 'Kalori', icon: <CalculatorIcon /> },
            { id: NavigationTab.BODY_FAT_CALCULATOR, label: 'Vücut Yağı', icon: <BodyFatIcon /> },
            { id: NavigationTab.MEAL_ANALYZER, label: 'Yemek Analizi', icon: <CameraIcon /> },
            { id: NavigationTab.AI_COACH, label: 'AI Buddy', icon: <ChatIcon /> },
            accountItem,
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isLoggedIn],
    );

    // Phone layout: 4 primary tabs + "Daha" sheet with the rest (nothing hidden).
    const primaryIds = [NavigationTab.WORKOUTS, NavigationTab.WORKOUT_LOG, NavigationTab.WATER_TRACKER, NavigationTab.AI_COACH];
    const primaryItems = navItems.filter((i) => primaryIds.includes(i.id));
    const moreItems = navItems.filter((i) => !primaryIds.includes(i.id));
    const moreActive = moreItems.some((i) => i.id === activeTab);

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center app-shell">
            <header className="app-header w-full sticky top-0 z-30 bg-gray-950/90 backdrop-blur border-b border-slate-900 sm:static sm:border-0 sm:bg-transparent">
                <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3 sm:py-6 sm:justify-center">
                    <div className="sm:text-center">
                        <h1 className="text-xl sm:text-4xl font-bold text-white tracking-tight">Gym Buddy</h1>
                        <p className="hidden sm:block mt-1 text-lg text-blue-400">AI Fitness & Beslenme Asistanı</p>
                    </div>
                    <button
                        onClick={() => setActiveTab(accountItem.id)}
                        className="sm:hidden tap-target flex items-center justify-center rounded-full text-slate-300 active:bg-slate-800"
                        aria-label={accountItem.label}
                    >
                        {accountItem.icon}
                    </button>
                </div>
                {!online && (
                    <div className="flex items-center justify-center gap-2 bg-amber-500/15 text-amber-300 text-xs py-1.5" role="status">
                        <OfflineIcon /> Çevrimdışı — değişiklikler bağlantı gelince senkronize edilecek.
                    </div>
                )}
            </header>

            {/* Desktop / tablet navigation (original top bar) */}
            <nav className="hidden sm:flex w-full max-w-3xl bg-slate-900/60 backdrop-blur-sm p-2 rounded-xl mb-8 justify-center items-center gap-2 shadow-lg">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        disabled={authLoading}
                        className={`flex-1 flex flex-col lg:flex-row justify-center items-center gap-2 px-2 py-2.5 text-xs font-medium rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${
                            activeTab === item.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`}
                        title={item.label}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>

            <main className="w-full max-w-6xl flex-grow px-3 pt-4 sm:px-6 sm:pt-0 lg:px-8 app-main">
                {authNotice && (
                    <div className="max-w-md mx-auto mb-4 p-3 rounded-lg bg-blue-900/40 border border-blue-800 text-blue-100 text-sm flex justify-between gap-3" role="status">
                        <span>{authNotice}</span>
                        <button onClick={() => setAuthNotice(null)} aria-label="Kapat" className="min-w-[32px]">✕</button>
                    </div>
                )}
                {recoveryMode && isLoggedIn ? (
                    <PasswordRecovery
                        onDone={(msg) => {
                            setRecoveryMode(false);
                            setAuthNotice(msg);
                        }}
                    />
                ) : (
                    renderContent()
                )}
            </main>

            <footer className="hidden sm:block w-full max-w-6xl text-center mt-12 py-4 border-t border-slate-800">
                <p className="text-slate-500 text-sm">Gym Buddy © 2024 - Tüm Hakları Saklıdır.</p>
            </footer>

            {/* Phone bottom navigation */}
            <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur border-t border-slate-800 bottom-nav">
                <div className="grid grid-cols-5">
                    {primaryItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => {
                                hapticTap();
                                setActiveTab(item.id);
                            }}
                            disabled={authLoading}
                            className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[11px] font-medium ${
                                activeTab === item.id ? 'text-blue-400' : 'text-slate-400'
                            }`}
                            aria-current={activeTab === item.id ? 'page' : undefined}
                        >
                            {item.icon}
                            <span className="truncate max-w-full px-1">{item.label}</span>
                        </button>
                    ))}
                    <button
                        onClick={() => {
                            hapticTap();
                            setMoreOpen((o) => !o);
                        }}
                        disabled={authLoading}
                        className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[11px] font-medium ${
                            moreActive || moreOpen ? 'text-blue-400' : 'text-slate-400'
                        }`}
                        aria-expanded={moreOpen}
                    >
                        <MoreIcon />
                        <span>Daha</span>
                    </button>
                </div>
            </nav>

            {moreOpen && (
                <div className="sm:hidden fixed inset-0 z-30" onClick={() => setMoreOpen(false)}>
                    <div className="absolute inset-0 bg-black/50" />
                    <div
                        className="absolute inset-x-0 bottom-0 bg-slate-900 rounded-t-2xl border-t border-slate-700 p-4 more-sheet animate-fade-in-up"
                        onClick={(e) => e.stopPropagation()}
                        role="menu"
                    >
                        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4" />
                        <div className="grid grid-cols-2 gap-3">
                            {moreItems.map((item) => (
                                <button
                                    key={item.id}
                                    role="menuitem"
                                    onClick={() => setActiveTab(item.id)}
                                    className={`flex items-center gap-3 p-4 rounded-xl text-sm font-semibold min-h-[56px] ${
                                        activeTab === item.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200 active:bg-slate-700'
                                    }`}
                                >
                                    {item.icon}
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
