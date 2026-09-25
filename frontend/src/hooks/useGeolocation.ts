type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
};

const TARGET_ACCURACY_METERS = 150;
const ACQUISITION_TIMEOUT_MS = 30_000;
const MAX_REPORTED_ACCURACY_METERS = 99_999;

export function permissionHelp() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const apple = /iPad|iPhone|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  if (apple) {
    return "Location blocked. On iPhone: Settings → Privacy → Location Services → Safari → While Using + Precise Location ON. Also: Safari → Settings → Location → Allow. Then reload and tap Allow.";
  }
  if (android) {
    return "Location blocked. On Android: Settings → Apps → Browser → Permissions → Location → Allow. Turn on High accuracy/GPS and Precise Location, then reload.";
  }
  return "Location permission denied. Enable location for this site in browser settings (lock icon → Site settings → Location → Allow), enable GPS/High accuracy, then reload.";
}

export function readingFrom(position: GeolocationPosition): DeviceLocation {
  const raw = Number(position.coords.accuracy);
  const accuracy =
    Number.isFinite(raw) && raw >= 0
      ? Math.min(raw, MAX_REPORTED_ACCURACY_METERS)
      : MAX_REPORTED_ACCURACY_METERS;
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: accuracy,
    capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
  };
}

function watchLocation(options: PositionOptions): Promise<DeviceLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(new Error("GPS is not available on this device."));

    let best: DeviceLocation | undefined;
    let watchId: number | undefined;
    let finished = false;

    const stop = () => {
      window.clearTimeout(timeoutId);
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
    const succeed = (location: DeviceLocation) => {
      if (finished) return;
      finished = true;
      stop();
      resolve(location);
    };
    const fail = (error: GeolocationPositionError) => {
      if (finished) return;
      if (best && error.code !== error.PERMISSION_DENIED) return succeed(best);
      finished = true;
      stop();
      const denied = error.code === error.PERMISSION_DENIED;
      reject(
        new Error(
          denied
            ? permissionHelp()
            : error.code === error.TIMEOUT
              ? "GPS timed out. Try again near a window, then tap Allow location."
              : "GPS is unavailable. Enable location services and try again.",
        ),
      );
    };
    const timeoutId = window.setTimeout(() => {
      if (best) return succeed(best);
      fail({
        code: 3,
        TIMEOUT: 3,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
      } as GeolocationPositionError);
    }, options.timeout || ACQUISITION_TIMEOUT_MS);

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const location = readingFrom(position);
        if (!best || location.accuracyMeters < best.accuracyMeters)
          best = location;
        // Accept best so far if reasonably accurate for indoor (150m)
        if (location.accuracyMeters <= TARGET_ACCURACY_METERS)
          succeed(location);
        // Also accept any fix if we already have best and waited 5s (indoor may never reach 150)
        // The timeout will return best anyway, but early succeed if we have something
      },
      fail,
      options,
    );
  });
}

export async function getLocation(): Promise<DeviceLocation> {
  if (
    typeof window !== "undefined" &&
    window.isSecureContext === false &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    throw new Error(
      "Location requires HTTPS. Open the site with https:// and allow location.",
    );
  }
  if (!navigator.geolocation) {
    throw new Error(
      "GPS not available on this device. Try another phone or ask instructor for manual check-in.",
    );
  }
  // Try high accuracy first (GPS), then low accuracy (network), then any cached
  try {
    return await watchLocation({
      enableHighAccuracy: true,
      timeout: ACQUISITION_TIMEOUT_MS,
      maximumAge: 0,
    });
  } catch (error) {
    // Permission denied -> don't retry, show help immediately
    if (error instanceof Error && /blocked|denied/i.test(error.message))
      throw error;
    try {
      return await watchLocation({
        enableHighAccuracy: false,
        timeout: 20_000,
        maximumAge: 30_000,
      });
    } catch (e2) {
      if (e2 instanceof Error && /blocked|denied/i.test(e2.message)) throw e2;
      // Final fallback: one-shot getCurrentPosition with long timeout (helps old Android WebView)
      try {
        return await new Promise<DeviceLocation>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(readingFrom(pos)),
            () => reject(error),
            { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
          );
        });
      } catch {
        throw error instanceof Error ? error : new Error(permissionHelp());
      }
    }
  }
}
