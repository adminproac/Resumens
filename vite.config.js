import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Project site: https://adminproac.github.io/Resumens/
  base: '/Resumens/',
});
