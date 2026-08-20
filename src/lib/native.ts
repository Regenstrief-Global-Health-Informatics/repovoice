import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/** True when running inside the Capacitor iOS (or Android) shell. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

let nativeHooksStarted = false;

/**
 * Native-only lifecycle: resume the sync queue when the app returns
 * to the foreground. Safe to call on the web — it's a no-op.
 */
export function startNativeAppHooks(onResume?: () => void): () => void {
  if (!isNativeApp() || nativeHooksStarted) {
    return () => {};
  }
  nativeHooksStarted = true;

  let handle: { remove: () => Promise<void> } | undefined;
  void App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) onResume?.();
  }).then((listener) => {
    handle = listener;
  });

  return () => {
    nativeHooksStarted = false;
    void handle?.remove();
  };
}
