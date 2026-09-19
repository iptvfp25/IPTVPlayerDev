export type RecentType = "live" | "vod" | "series";

export interface RecentEntry {
  id: string;
  name: string;
  type: RecentType;
  categoryId?: string;
  icon?: string;
  poster?: string;
  rating?: string;
  plot?: string;
  genre?: string;
  containerExtension?: string;
  seriesId?: number;
  watchedAt: number;
}

const STORAGE_KEY = "iptv-recently-watched";
const MAX_ENTRIES_PER_TYPE = 20;
const CHANGE_EVENT = "iptv-recently-watched-changed";

function loadAll(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveAll(entries: RecentEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Records (or bumps to the top of) the "recently watched" list for a
// channel/movie/series. Called the moment playback actually starts, so the
// list reflects what the user has watched rather than just browsed past.
// Kept capped per content type so the list stays a short, genuinely useful
// "continue browsing here" shortcut instead of growing forever.
export function recordWatched(entry: Omit<RecentEntry, "watchedAt">) {
  if (!entry.id) return;
  const all = loadAll();
  const filtered = all.filter((e) => !(e.type === entry.type && e.id === entry.id));
  filtered.unshift({ ...entry, watchedAt: Date.now() });

  const byType = new Map<RecentType, RecentEntry[]>();
  for (const e of filtered) {
    const list = byType.get(e.type) || [];
    if (list.length < MAX_ENTRIES_PER_TYPE) list.push(e);
    byType.set(e.type, list);
  }

  const capped: RecentEntry[] = [];
  for (const list of byType.values()) capped.push(...list);
  capped.sort((a, b) => b.watchedAt - a.watchedAt);
  saveAll(capped);
}

export function getRecentlyWatched(type: RecentType): RecentEntry[] {
  return loadAll()
    .filter((e) => e.type === type)
    .sort((a, b) => b.watchedAt - a.watchedAt);
}

// Lets components (Sidebar's Live tab, NetflixBrowse's Movies/Series tabs)
// react immediately when a new item is watched elsewhere in the app,
// instead of only picking up the change the next time they happen to
// re-mount.
export function subscribeRecentlyWatched(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}
