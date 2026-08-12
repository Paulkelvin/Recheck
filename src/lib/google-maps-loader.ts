// Loads the Maps JavaScript API once and caches the promise, so multiple
// preview cards on a page (or re-renders) don't inject the script twice.
//
// Resolving on the script tag's `onload` is NOT enough and was a real bug:
// the URL below returns a small bootstrap that fetches the actual API
// asynchronously, so at onload `google.maps` exists but `google.maps.Map`
// does not yet. Constructing a Map at that point throws
// "google.maps.Map is not a constructor". Google's `callback` parameter is
// the documented signal that the API is genuinely ready to use, so that's
// what this waits for.

const CALLBACK_NAME = "__recheckGoogleMapsReady";
// If neither the callback nor an auth failure ever fires (blocked network,
// a proxy swallowing the request), give up rather than leave the caller
// waiting on a promise that never settles.
const LOAD_TIMEOUT_MS = 15_000;

export class MapsLoadError extends Error {
  constructor(public readonly kind: "not_configured" | "unavailable") {
    super(kind);
  }
}

let loadPromise: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (loadPromise) return loadPromise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Promise.reject(new MapsLoadError("not_configured"));
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new MapsLoadError("unavailable"));
      return;
    }
    if (window.google?.maps?.Map) {
      resolve();
      return;
    }

    const timer = setTimeout(() => reject(new MapsLoadError("unavailable")), LOAD_TIMEOUT_MS);
    const settle = (fn: () => void) => {
      clearTimeout(timer);
      fn();
    };

    const w = window as unknown as Record<string, unknown>;
    w[CALLBACK_NAME] = () => settle(resolve);
    // Google's documented hook for a key rejected at runtime (referrer not
    // allowed, key invalid, billing off). Without this the callback simply
    // never fires and the page waits for the timeout.
    w.gm_authFailure = () => settle(() => reject(new MapsLoadError("unavailable")));

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&loading=async&callback=${CALLBACK_NAME}`;
    script.async = true;
    script.onerror = () => settle(() => reject(new MapsLoadError("unavailable")));
    document.head.appendChild(script);
  });

  return loadPromise;
}

declare global {
  interface Window {
    google?: typeof google;
  }
}
