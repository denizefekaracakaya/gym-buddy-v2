import { defineConfig } from 'vitest/config';

// Firestore security-rules tests; run inside the emulator:
//   npm run test:rules
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/rules/**/*.test.ts'],
        testTimeout: 20000,
    },
});
