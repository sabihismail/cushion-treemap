import { defineConfig } from 'vite'

// The demo lives in /demo and imports the library straight from /src.
export default defineConfig({
  root: 'demo',
  server: { open: true },
})
