import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node18',
  outDir: 'dist',
  splitting: false,
  treeshake: true,
  minify: false, // Keep readable for debugging
  banner: {
    js: '#!/usr/bin/env node'
  },
  external: [
    // Node.js built-ins
    'node:fs',
    'node:path',
    'node:child_process'
  ],
  // Copy eslint config files to dist
  onSuccess: async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')

    const eslintDir = path.join('dist', 'eslint')
    if (!fs.existsSync(eslintDir)) {
      fs.mkdirSync(eslintDir, { recursive: true })
    }

    // Copy eslint files (ESM format - modern)
    fs.copyFileSync('src/eslint/config.mjs', path.join(eslintDir, 'config.mjs'))
    fs.copyFileSync('src/eslint/rules.json', path.join(eslintDir, 'rules.json'))
    fs.copyFileSync('src/eslint/sonarjs-rules.js', path.join(eslintDir, 'sonarjs-rules.js'))

    console.log('✅ ESLint config files copied to dist/')
  }
})
