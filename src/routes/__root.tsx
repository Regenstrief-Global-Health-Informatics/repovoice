import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PwaRegister } from "@/components/pwa-register";
// Side-effect import — keeps Tailwind in the graph even with sideEffects:false
import "../styles.css";
import appCss from "../styles.css?url";

/** Minimal dark shell always present before/without Tailwind */
const CRITICAL_CSS = `
html,body{background:#0a0a0b!important;color:#f4f4f5!important;margin:0;min-height:100%;font-family:system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;max-width:100%}
#app-root{background:#0a0a0b;color:#f4f4f5;min-height:100dvh;max-width:100%;overflow-x:hidden}
button,input,textarea,select{font:inherit;color:inherit}
`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1",
      },
      {
        title: "RepoVoice — Record, transcribe, commit",
      },
      {
        name: "description",
        content:
          "Offline-first voice notes: record, transcribe with Grok, commit to GitHub.",
      },
      { name: "theme-color", content: "#0a0a0b" },
      { name: "color-scheme", content: "dark" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
      { name: "apple-mobile-web-app-title", content: "RepoVoice" },
      { name: "application-name", content: "RepoVoice" },
    ],
    links: [
      // Static fallback first (works even if Vite CSS path is wrong after deploy)
      {
        rel: "stylesheet",
        href: "/repovoice-base.css",
      },
      // Tailwind / app tokens (hashed in prod)
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icons/icon-180.png" },
    ],
    styles: [{ children: CRITICAL_CSS }],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body
        className="min-h-screen bg-bg text-fg antialiased"
        style={{ backgroundColor: "#0a0a0b", color: "#f4f4f5" }}
      >
        <AuthProvider>
          <div
            id="app-root"
            className="min-h-screen max-w-full overflow-x-hidden bg-bg text-fg"
            style={{ backgroundColor: "#0a0a0b", color: "#f4f4f5" }}
          >
            <Outlet />
          </div>
          <PwaRegister />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
