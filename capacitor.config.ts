import type { CapacitorConfig } from '@capacitor/cli';

// The application ID is permanent once released; do not change it.
const config: CapacitorConfig = {
    appId: 'io.github.denizefekaracakaya.gymbuddy',
    appName: 'Gym Buddy',
    webDir: 'dist',
    backgroundColor: '#030712',
    android: {
        // Release builds must not expose the WebView to chrome://inspect.
        webContentsDebuggingEnabled: false,
        allowMixedContent: false,
    },
    plugins: {
        SplashScreen: {
            launchAutoHide: false, // hidden from index.tsx once React has rendered
            launchShowDuration: 3000,
            backgroundColor: '#030712',
            showSpinner: false,
        },
        StatusBar: {
            style: 'DARK',
            overlaysWebView: true,
        },
        Keyboard: {
            resizeOnFullScreen: true,
        },
        LocalNotifications: {
            smallIcon: 'ic_stat_water',
            iconColor: '#3B82F6',
        },
    },
};

export default config;
