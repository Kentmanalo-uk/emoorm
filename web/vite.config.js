import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'



// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Listen on the LAN as well, so phones on the same Wi-Fi can open the dev site.
  server: {
    host: true,
  },
  build: {
    // Keep classic media-query syntax (max-width: 768px) in the built CSS.
    // The default minifier emits `(width <= 768px)`, which older phone
    // browsers ignore — dropping every responsive rule on those devices.
    cssTarget: ['chrome87', 'safari14', 'firefox78', 'edge88'],
  },
})

