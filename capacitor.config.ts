import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "org.openmrs.repovoice",
  appName: "RepoVoice",
  // TanStack Start Vite client output (see `npm run build:ios`)
  webDir: "dist/client",
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
  plugins: {
    // Lets WKWebView call xAI / OpenAI / GitHub without browser CORS.
    // Does not wrap a remote website — there is no server.url.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
