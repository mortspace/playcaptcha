import { copyFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

export default defineConfig({
  // two entries: the browser component (index) and the Node/server module.
  // They build into separate chunks so the client bundle never pulls in
  // node:crypto, and consumers can tree-shake the server half out of the
  // browser build entirely.
  entry: ['src/index.ts', 'src/server/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react-dom', 'motion'],
  // the stylesheet ships alongside, imported via 'playcaptcha/clawcaptcha.css'.
  // the toy renders + logo live in assets/ and are served statically by the app.
  onSuccess: async () => {
    copyFileSync('src/clawcaptcha.css', 'dist/clawcaptcha.css')
  },
})
