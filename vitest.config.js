import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        environment: 'node',
        globals: true,
    },
    coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'lcov'],
        include: ['src/shared/tasks/**/*.js', 'src/storage/**/*.js', 'src/worldbook/commands/**/*.js'],
        thresholds: {
            'src/storage/**/*.js': { statements: 90, branches: 80, functions: 80, lines: 90 },
            'src/worldbook/commands/**/*.js': { statements: 70, branches: 60, functions: 85, lines: 70 },
            'src/shared/tasks/lifecycle.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
        },
    },
});
