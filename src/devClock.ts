/**
 * App clock. Normally just Date.now(), but in dev builds a time offset can be
 * set (e.g. from the console) to "travel" forward in days and check that cards
 * come back for review on schedule — without waiting real days.
 */
const KEY = "__hanzi_time_offset_ms";

export function now(): number {
  if (import.meta.env.DEV) {
    const off = Number(localStorage.getItem(KEY) || 0);
    return Date.now() + off;
  }
  return Date.now();
}

export function getDayOffset(): number {
  return Number(localStorage.getItem(KEY) || 0) / 86_400_000;
}

export function setDayOffset(days: number): void {
  localStorage.setItem(KEY, String(Math.round(days * 86_400_000)));
}

// Expose a tiny console helper during development.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__timeTravel = (days: number) => {
    setDayOffset(days);
    return `Time offset set to +${days} day(s). Reload to apply.`;
  };
}
