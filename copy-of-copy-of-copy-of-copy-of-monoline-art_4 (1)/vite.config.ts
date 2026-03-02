
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
    'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY)
  },
  build: {
    outDir: 'dist'
  },
  server: {
  }
});
