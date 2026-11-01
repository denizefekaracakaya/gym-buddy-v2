#!/usr/bin/env node
// Scans a built web bundle (default: dist/) for things that must never ship:
// Google/Gemini API keys, Supabase secret / service-role keys, references to
// server-side secret names, dev-only backend URLs and runtime CDN code.
// (The Supabase *publishable* key is public by design and allowed.)
// Usage: node scripts/verify-bundle.mjs [dir]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { join, extname } from 'node:path';

const dir = process.argv[2] || 'dist';
const rules = [
    { name: 'Google / Gemini API key', re: /AIza[0-9A-Za-z_-]{35}/g },
    { name: 'Supabase secret key', re: /sb_secret_[0-9A-Za-z_-]{10,}/g },
    {
        name: 'Supabase service_role JWT',
        re: /eyJ[0-9A-Za-z_-]+\.eyJ[0-9A-Za-z_-]+\.[0-9A-Za-z_-]+/g,
        allow: (m) => {
            try {
                return JSON.parse(Buffer.from(m.split('.')[1], 'base64url').toString()).role !== 'service_role';
            } catch {
                return true;
            }
        },
    },
    { name: 'secret variable name', re: /GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|process\.env\.API_KEY/g },
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
