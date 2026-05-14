import { defineConfig } from 'vite';

// GitHub Project Pages: https://awayway.github.io/DrivingInstructorShiftSchedule/
const GH_PAGES_BASE = '/DrivingInstructorShiftSchedule/';

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : GH_PAGES_BASE,
  root: '.',
  server: { port: 5173, open: true },
  build: { outDir: 'docs', emptyOutDir: true },
}));
