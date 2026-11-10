// Deploy build: only the coding/review test scene (coding-test.html), no legacy assets.
// Public assets are copied selectively by scripts/build-deploy.mjs.
import {defineConfig} from 'vite';

export default defineConfig({
  publicDir: false,
  build: {outDir: 'dist-deploy', emptyOutDir: true, rollupOptions: {input: 'coding-test.html'}},
});
