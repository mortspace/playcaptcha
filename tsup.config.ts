import { copyFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react-dom', 'motion'],
  // the stylesheet ships alongside, imported via 'sataruz-captcha/sataruz-captcha.css'.
  // the toy renders + logo live in assets/ and are served statically by the app.
  onSuccess: async () => {
    copyFileSync('src/sataruz-captcha.css', 'dist/sataruz-captcha.css')
  },
})
