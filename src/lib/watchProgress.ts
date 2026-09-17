import { debouncedPushProgress } from "@/lib/sync";

const PROGRESS_KEY = "iptv-watch-progress";

export interface WatchEntry {
  /** Percentage watched 0-100 */
  progress: number;
  /** Current time in seconds */
  currentTime: number;
  /** Total duration in seconds */
  duration: number;
  /** Timestamp of last update */
  updatedAt: number;
}

function getStore(): Record<string, WatchEntry> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, WatchEntry>) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(store));
}

export function makeKey(type: "vod" | "series", id: number): string {
  return `${type}:${id}`;
}

export function makeEpisodeKey(seriesId: number, episodeId: number): string {
  return `ep:${seriesId}:${episodeId}`;
}

export function getProgress(key: string): WatchEntry | null {
  const store = getStore();
  return store[key] || null;
}

export function setProgress(key: string, currentTime: number, duration: number) {
  if (duration <= 0) return;
  const store = getStore();
  const progress = Math.min(100, Math.round((currentTime / duration) * 100));
  store[key] = { progress, currentTime, duration, updatedAt: Date.now() };
  saveStore(store);
  debouncedPushProgress();
}

export function isWatched(key: string): boolean {
  const entry = getProgress(key);
  return !!entry && entry.progress >= 90;
}

export function getResumeTime(key: string): number {
  const entry = getProgress(key);
  if (!entry || entry.progress >= 95) return 0;
  return entry.currentTime;
}

export function getNextEpisode(
  seriesId: number,
  episodes: { episode_id: number; season: number }[]
): { episode_id: number; season: number } | null {
  if (episodes.length === 0) return null;

  for (const ep of episodes) {
    const key = makeEpisodeKey(seriesId, ep.episode_id);
    if (!isWatched(key)) return ep;
  }

  return null;
}

export function getEpisodeProgress(seriesId: number, episodeId: number): WatchEntry | null {
  return getProgress(makeEpisodeKey(seriesId, episodeId));
}
