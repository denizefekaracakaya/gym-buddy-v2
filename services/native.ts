// Thin wrappers around Capacitor plugins with browser fallbacks, so components
// work the same on Android and on the web build.

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';

export const isNative = Capacitor.isNativePlatform();

// ---------- external links ----------

export async function openExternal(url: string): Promise<void> {
    if (!/^https:\/\//.test(url)) return;
    if (isNative) await Browser.open({ url });
    else window.open(url, '_blank', 'noopener,noreferrer');
}

// ---------- haptics ----------

export function hapticTap(): void {
    if (isNative) Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}

export function hapticSuccess(): void {
    if (isNative) Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
}

// ---------- images ----------

export interface PickedImage {
    /** base64 without the data: prefix */
    base64: string;
    mimeType: 'image/jpeg';
    dataUrl: string;
}

export const MAX_IMAGE_EDGE = 1280;
export const JPEG_QUALITY = 0.8;

export class ImagePickCancelled extends Error {}

/** Downscales any browser-decodable image to ≤ MAX_IMAGE_EDGE px JPEG. */
export async function resizeToJpeg(source: Blob | string): Promise<PickedImage> {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('Görsel okunamadı. Lütfen JPEG veya PNG bir fotoğraf seçin.'));
            el.src = url;
        });
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Görsel işlenemedi.');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg', dataUrl };
    } finally {
        if (typeof source !== 'string') URL.revokeObjectURL(url);
    }
}

/**
 * On Android: native sheet "Camera / Gallery" via @capacitor/camera. Taking a
 * photo asks for the CAMERA permission the first time; the gallery uses the
 * Android photo picker, which needs no storage permission.
 * On the web: callers use an <input type="file"> and pass the File to resizeToJpeg.
 */
export async function pickImageNative(): Promise<PickedImage> {
    try {
        const photo = await Camera.getPhoto({
            resultType: CameraResultType.DataUrl,
            source: CameraSource.Prompt,
            quality: 80,
            width: MAX_IMAGE_EDGE,
            height: MAX_IMAGE_EDGE,
            correctOrientation: true,
            promptLabelHeader: 'Fotoğraf',
            promptLabelPhoto: 'Galeriden Seç',
            promptLabelPicture: 'Fotoğraf Çek',
            promptLabelCancel: 'İptal',
        });
        if (!photo.dataUrl) throw new Error('Fotoğraf alınamadı.');
        // Normalise format/size (gallery images may be PNG/HEIC/large).
        return await resizeToJpeg(photo.dataUrl);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/cancel/i.test(msg)) throw new ImagePickCancelled(msg);
        if (/denied|permission/i.test(msg)) {
            throw new Error('Kamera izni verilmedi. Fotoğraf çekmek için Ayarlar > Uygulamalar > Gym Buddy > İzinler bölümünden kameraya izin verin ya da galeriden seçin.');
        }
        throw e instanceof Error ? e : new Error(msg);
    }
}

// ---------- water reminders ----------

const WATER_CHANNEL = 'water-reminders';
const FIRST_ID = 7000;
const MAX_SCHEDULED = 48;
/** Reminders are only scheduled between these local hours. */
export const REMINDER_START_HOUR = 8;
export const REMINDER_END_HOUR = 22;

/** Times for the next 24 h at `intervalMin` spacing, restricted to waking hours. */
export function reminderTimes(now: Date, intervalMin: number, max = MAX_SCHEDULED): Date[] {
    const out: Date[] = [];
    const step = Math.max(15, intervalMin) * 60_000;
    const end = now.getTime() + 24 * 3_600_000;
    for (let t = now.getTime() + step; t <= end && out.length < max; t += step) {
        const d = new Date(t);
        const h = d.getHours();
        if (h >= REMINDER_START_HOUR && h < REMINDER_END_HOUR) out.push(d);
    }
    return out;
}

export type ReminderPermission = 'granted' | 'denied' | 'unsupported';

export async function requestReminderPermission(): Promise<ReminderPermission> {
    if (isNative) {
        const current = await LocalNotifications.checkPermissions();
        if (current.display === 'granted') return 'granted';
        const res = await LocalNotifications.requestPermissions();
        return res.display === 'granted' ? 'granted' : 'denied';
    }
    if (!('Notification' in window)) return 'unsupported';
    const p = await Notification.requestPermission();
    return p === 'granted' ? 'granted' : 'denied';
}

const NOTIF_ASKED_KEY = 'gym_buddy_notification_permission_asked';

/**
 * Asks for the notification permission once, on the first launch of the
 * Android app (Android 13+ shows the system dialog). Denial is respected; the
 * user can still enable reminders later from the water tracker / Settings.
 */
export async function askNotificationPermissionOnce(): Promise<void> {
    if (!isNative) return;
    try {
        if (localStorage.getItem(NOTIF_ASKED_KEY)) return;
        localStorage.setItem(NOTIF_ASKED_KEY, '1');
    } catch {
        return;
    }
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'prompt' || current.display === 'prompt-with-rationale') {
        await LocalNotifications.requestPermissions();
    }
}

export async function cancelWaterReminders(): Promise<void> {
    if (!isNative) return;
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter((n) => n.id >= FIRST_ID && n.id < FIRST_ID + MAX_SCHEDULED);
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
}

/**
 * Android: schedules the next 24 h of reminders as individual local
 * notifications (re-done whenever the app starts/resumes or settings change),
 * so they fire even when the app is closed.
 */
export async function scheduleWaterReminders(intervalMin: number): Promise<void> {
    if (!isNative) return;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;
    await LocalNotifications.createChannel({
        id: WATER_CHANNEL,
        name: 'Su hatırlatıcıları',
        description: 'Su içme hatırlatmaları',
        importance: 4,
        visibility: 1,
    }).catch(() => undefined);
    await cancelWaterReminders();
    const times = reminderTimes(new Date(), intervalMin);
    if (!times.length) return;
    await LocalNotifications.schedule({
        notifications: times.map((at, i) => ({
            id: FIRST_ID + i,
            title: 'Gym Buddy: Su İçme Zamanı! 💧',
            body: 'Hedefine ulaşmak için bir bardak su içmeyi unutma.',
            channelId: WATER_CHANNEL,
            schedule: { at, allowWhileIdle: true },
            // Inexact alarms: no "Alarms & reminders" special permission screen
            // (SCHEDULE_EXACT_ALARM is removed from the manifest on purpose).
            isExactNotification: false,
            smallIcon: 'ic_stat_water',
        })),
    });
}
