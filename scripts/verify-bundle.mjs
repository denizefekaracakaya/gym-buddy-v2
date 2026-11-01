#!/usr/bin/env node
// Scans a built web bundle (default: dist/) for things that must never ship:
// Gemini/Google API keys other than the public Firebase web key, references to
// server-side secret names, dev-only backend URLs and runtime CDN code.
// Usage: node scripts/verify-bundle.mjs [dir]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const dir = process.argv[2] || 'dist';
const firebaseConfig = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const allowedKeys = new Set([firebaseConfig.apiKey]); // public Firebase web identifier, protected by Security Rules

const rules = [
    { name: 'Google API key (not the Firebase web key)', re: /AIza[0-9A-Za-z_-]{35}/g, allow: (m) => allowedKeys.has(m) },
    { name: 'secret variable name', re: /GEMINI_API_KEY|process\.env\.API_KEY/g },
    { name: 'dev backend URL', re: /https?:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2):(?:3000|5173|8080|8787)/g },
    { name: 'runtime CDN code', re: /esm\.sh\/|cdn\.tailwindcss\.com|fonts\.googleapis\.com/g },
    { name: 'private key material', re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
];

const files = [];
const walk = (d) => {
    for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (['.js', '.html', '.css', '.json', '.map'].includes(extname(p))) files.push(p);
    }
};
walk(dir);

let failures = 0;
for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const rule of rules) {
        for (const m of text.match(rule.re) || []) {
            if (rule.allow?.(m)) continue;
            failures++;
            console.error(`✗ ${rule.name} in ${file}: ${m.slice(0, 12)}…`);
        }
    }
}

if (failures) {
    console.error(`\nBundle verification FAILED (${failures} finding(s)).`);
    process.exit(1);
}
console.log(`✓ Bundle verification passed (${files.length} files scanned in ${dir}).`);
