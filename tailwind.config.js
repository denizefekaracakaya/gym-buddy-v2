import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './App.tsx', './index.tsx', './constants.tsx', './components/**/*.tsx'],
    theme: { extend: {} },
    plugins: [typography],
};
