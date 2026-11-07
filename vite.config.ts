import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'apple-touch-icon.png'],
    manifest: { name: 'Pocket — Money management', short_name: 'Pocket', description: 'Budgets and Flying Blue credit', theme_color: '#163d32', background_color: '#f6f7f2', display: 'standalone', start_url: '/', scope: '/', icons: [{src:'/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}] },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,ico}'], navigateFallbackDenylist: [/^\/auth\//] }
  })],
});
