import { useEffect } from "react";

/**
 * Registers the offline service worker and recovers Safari "unstyled after refresh"
 * when a stale SW served HTML for CSS.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // One-time recovery: if Tailwind tokens never applied, purge SW + hard reload
    const recoverIfUnstyled = async () => {
      try {
        // Tailwind sets --color-bg on :root when styles.css loads
        const token = getComputedStyle(document.documentElement)
          .getPropertyValue("--color-bg")
          .trim();
        const baseOk = Boolean(
          document.querySelector('link[href*="repovoice-base.css"]'),
        );
        // If neither token nor base sheet applied after a beat, force reset
        if (token || baseOk) {
          // Still ensure base sheet is linked (Safari sometimes drops dynamic links)
          if (!document.querySelector('link[href="/repovoice-base.css"]')) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = "/repovoice-base.css";
            document.head.appendChild(link);
          }
          return;
        }

        const flag = "repovoice-style-recover";
        if (sessionStorage.getItem(flag) === "1") return;
        sessionStorage.setItem(flag, "1");

        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        }
        // Bust cache on reload
        const url = new URL(window.location.href);
        url.searchParams.set("_rv", String(Date.now()));
        window.location.replace(url.toString());
      } catch {
        // ignore
      }
    };

    const t = window.setTimeout(() => void recoverIfUnstyled(), 1200);

    if (!("serviceWorker" in navigator)) {
      return () => window.clearTimeout(t);
    }

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          updateViaCache: "none",
          scope: "/",
        });
        void reg.update();

        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        // New SW took control → reload once so CSS/JS match the deploy
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      } catch {
        // registration can fail in restricted previews — non-fatal
      }
    };

    if (document.readyState === "complete") void register();
    else window.addEventListener("load", () => void register(), { once: true });

    return () => window.clearTimeout(t);
  }, []);

  return null;
}
