import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Static SPA client build for the Capacitor iOS shell.
 *
 * Intentionally no Nitro / Vercel / PGLite / auth-popup plugins — those are
 * for the hosted web preview. Output is Vite's TanStack Start client folder:
 * `dist/client` (see capacitor.config.ts `webDir`).
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: {
          outputPath: "index.html",
        },
      },
    }),
    viteReact(),
  ],
});
