import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/fixtures/**',
        'src/types/**',
        'src/**/index.ts',
        'src/server.ts',
        // Heavy subprocess / Sonar paths covered by integration tests; keeps unit-coverage threshold meaningful.
        'src/phases/**',
        'src/core/Verifier.ts'
      ],
      thresholds: {
        lines: 90,
        statements: 88,
        branches: 73
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
})
