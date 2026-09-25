import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";

export type ServerClock = {
  clock: Date;
  offsetMs: number;
  skewMs: number;
  isSynced: boolean;
  isStale: boolean;
  resync: () => Promise<void>;
};

/**
 * Server-authoritative EAT clock.
 * Computes offset = serverNowMs - Date.now() once on mount via GET /student/attendance/server-time
 * Fallback: if sync not yet done, offset=0 (phone time) but isSynced=false so UI can show warning.
 * All checkout windows must use clock.getTime() instead of Date.now().
 */
export function useServerClock(pollMs = 5 * 60 * 1000): ServerClock {
  const [offsetMs, setOffsetMs] = useState(0);
  const [isSynced, setIsSynced] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const offsetRef = useRef(0);

  const sync = async () => {
    try {
      const res = await api.get("/student/attendance/server-time");
      const serverNow = res.data?.serverNow as string | undefined;
      if (!serverNow) return;
      const serverMs = new Date(serverNow).getTime();
      if (!Number.isFinite(serverMs)) return;
      // Account for network latency crudely: half RTT not measured; acceptable for 1s accuracy
      const offset = serverMs - Date.now();
      offsetRef.current = offset;
      setOffsetMs(offset);
      setIsSynced(true);
    } catch {
      // keep previous offset / unsynced state
    }
  };

  useEffect(() => {
    void sync();
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    const poll = window.setInterval(() => void sync(), pollMs);
    const onFocus = () => {
      setTick(Date.now());
      void sync();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [pollMs]);

  const clock = new Date(tick + offsetRef.current);
  // Keep ref and state in sync for consumers that read offsetMs
  // offsetRef updated in sync(), offsetMs state mirrors it
  return {
    clock,
    offsetMs,
    skewMs: Math.abs(offsetMs),
    isSynced,
    isStale: !isSynced,
    resync: sync,
  };
}

/**
 * Backwards-compatible: if initialServerNow (ISO from active-session) is provided,
 * we can compute offset synchronously without waiting for network.
 */
export function useServerClockWithInitial(
  initialServerNow?: string | null,
  pollMs = 5 * 60 * 1000,
): ServerClock {
  const initialOffset = (() => {
    if (!initialServerNow) return 0;
    const ms = new Date(initialServerNow).getTime();
    return Number.isFinite(ms) ? ms - Date.now() : 0;
  })();
  const [offsetMs, setOffsetMs] = useState(initialOffset);
  const [isSynced, setIsSynced] = useState(Boolean(initialServerNow));
  const [tick, setTick] = useState(() => Date.now());
  const offsetRef = useRef(initialOffset);

  useEffect(() => {
    offsetRef.current = initialOffset;
    setOffsetMs(initialOffset);
    setIsSynced(Boolean(initialServerNow));
  }, [initialServerNow]);

  const sync = async () => {
    try {
      const res = await api.get("/student/attendance/server-time");
      const serverNow = res.data?.serverNow as string | undefined;
      if (!serverNow) return;
      const serverMs = new Date(serverNow).getTime();
      if (!Number.isFinite(serverMs)) return;
      const offset = serverMs - Date.now();
      offsetRef.current = offset;
      setOffsetMs(offset);
      setIsSynced(true);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    const poll = window.setInterval(() => void sync(), pollMs);
    const onFocus = () => {
      setTick(Date.now());
      void sync();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    // sync on mount if no initial
    if (!initialServerNow) void sync();
    return () => {
      window.clearInterval(timer);
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [pollMs, initialServerNow]);

  const clock = new Date(tick + offsetRef.current);
  return {
    clock,
    offsetMs,
    skewMs: Math.abs(offsetMs),
    isSynced,
    isStale: !isSynced,
    resync: sync,
  };
}
