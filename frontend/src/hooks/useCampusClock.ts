import { useServerClock } from "./useServerClock";

/**
 * @deprecated Use useServerClock for server-authoritative EAT. Kept for
 * backward compat — now delegates to server time (phone clock no longer trusted).
 */
export function useCampusClock() {
  const { clock } = useServerClock();
  return clock;
}

export { useServerClock } from "./useServerClock";
