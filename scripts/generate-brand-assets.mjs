#!/usr/bin/env node
// Generates the source images for `npm run android:assets` (@capacitor/assets)
// and the web icons, from one SVG mark (the lightning bolt used in the app's
// "Egzersizler" tab) in the app's blue/near-black palette.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const BOLT = 'M13 10V3L4 14h7v7l9-11h-7z';
const BG = '#030712';

const bolt = (size, color, scale) => {
    const s = (size * scale) / 24;
    const off = (size - 24 * s) / 2;
    return `<g transform="translate(${off} ${off}) scale(${s})"><path d="${BOLT}" fill="${color}" stroke="${color}" stroke-width="1.2" stroke-linejoin="round"/></g>`;
};
const gradient = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B82F6"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient></defs>`;

const svg = (size, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${gradient}${body}</svg>`);

mkdirSync('resources', { recursive: true });
mkdirSync('public', { recursive: true });

// Full icon (legacy launchers, web)
const full = svg(1024, `<rect width="1024" height="1024" rx="224" fill="url(#g)"/>${bolt(1024, '#FFFFFF', 0.62)}`);
await sharp(full).png().toFile('resources/icon-only.png');
await sharp(full).resize(192).png().toFile('public/icon-192.png');
await sharp(full).resize(512).png().toFile('public/icon-512.png');

// Adaptive icon layers (foreground must keep the mark inside the 66% safe zone)
await sharp(svg(1024, bolt(1024, '#FFFFFF', 0.42))).png().toFile('resources/icon-foreground.png');
await sharp(svg(1024, `<rect width="1024" height="1024" fill="url(#g)"/>`)).png().toFile('resources/icon-background.png');

// Splash (dark only; the app has no light theme)
const splash = svg(2732, `<rect width="2732" height="2732" fill="${BG}"/>
  <rect x="1066" y="1066" width="600" height="600" rx="132" fill="url(#g)"/>${bolt(2732, '#FFFFFF', 0.13)}`);
await sharp(splash).png().toFile('resources/splash.png');
await sharp(splash).png().toFile('resources/splash-dark.png');
console.log('Brand assets written to resources/ and public/.');
