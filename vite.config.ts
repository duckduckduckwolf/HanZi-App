/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Served under /HanZi-App/ on GitHub Pages; "/" locally. Overridden at build.
  base: process.env.APP_BASE ?? "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["cedict.tsv", "icons/apple-touch-icon.png"],
      workbox: {
        // The dictionary file is large; allow it to be precached.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,tsv,png,svg,ico}"],
        runtimeCaching: [
          {
            // Stroke data fetched on demand from the CDN — cache for offline reuse.
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/hanzi-writer-data.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "hanzi-stroke-data",
              expiration: { maxEntries: 12000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "HanZi — Chinese writing practice",
        short_name: "HanZi",
        description:
          "Practise writing Chinese characters with spaced-repetition review.",
        theme_color: "#2563eb",
        background_color: "#f7f6f3",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
});
