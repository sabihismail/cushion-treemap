// Builds the demo two ways from a single source (demo/):
//   1. dist-demo/             — multi-file, for GitHub Pages (base = /cushion-treemap/)
//   2. cushion-treemap-demo.html — one self-contained file, double-click to open offline
import { build } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const demo = resolve(root, 'demo')

// 1. GitHub Pages build
await build({
  root: demo,
  base: '/cushion-treemap/',
  logLevel: 'warn',
  build: { outDir: resolve(root, 'dist-demo'), emptyOutDir: true },
})

// 2. Single-file offline build
await build({
  root: demo,
  base: './',
  logLevel: 'warn',
  plugins: [viteSingleFile()],
  build: { outDir: resolve(root, 'dist-single'), emptyOutDir: true },
})
copyFileSync(resolve(root, 'dist-single/index.html'), resolve(root, 'cushion-treemap-demo.html'))

console.log('\n✓ Pages build  -> dist-demo/')
console.log('✓ Offline file -> cushion-treemap-demo.html (open by double-click)\n')
