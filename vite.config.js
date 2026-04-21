import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/capex-floor-map/',  // matches GitHub repo name for GitHub Pages
})
