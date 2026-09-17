import { supabase } from "@/lib/supabase";
import type { AppSettings, AppLanguage, AccentColor } from "@/lib/settings";
import type { FavoriteEntry } from "@/lib/favorites";
import type { WatchEntry } from "@/lib/watchProgress";

let _userId: string | null = null;

export function setSyncUserId(id: string | null) {
  _userId = id;
}

export function getSyncUserId(): string | null {
  return _userId;
}

// ---- Settings sync ----

export async function pushSettings(settings: AppSettings) {
  if (!_userId) return;
  await supabase.from("user_settings").upsert({
    user_id: _userId,
    language: settings.language,
    accent_color: settings.accentColor,
    updated_at: new Date().toISOString(),
  });
}

export async function pullSettings(): Promise<AppSettings | null> {
  if (!_userId) return null;
  const { data } = await supabase
    .from("user_settings")
    .select("language, accent_color")
    .eq("user_id", _userId)
    .maybeSingle();
  if (!data) return null;
  return {
    language: (data.language || "en") as AppLanguage,
    accentColor: (data.accent_color || "rose") as AccentColor,
  };
}

// ---- Favorites sync ----

export async function pushFavorites(favorites: FavoriteEntry[]) {
  if (!_userId) return;
  // Delete all existing, then insert current set
  await supabase.from("user_favorites").delete().eq("user_id", _userId);
  if (favorites.length === 0) return;
  const rows = favorites.map((f) => ({
    user_id: _userId!,
    item_id: f.id,
    item_type: f.type,
    name: f.name,
    poster: f.poster || null,
    rating: f.rating || null,
    plot: f.plot || null,
    genre: f.genre || null,
    container_extension: f.containerExtension || null,
    series_id: f.seriesId || null,
  }));
  await supabase.from("user_favorites").insert(rows);
}

export async function pullFavorites(): Promise<FavoriteEntry[]> {
  if (!_userId) return [];
  const { data } = await supabase
    .from("user_favorites")
    .select("*")
    .eq("user_id", _userId)
    .order("created_at", { ascending: false });
  if (!data) return [];
  return data.map((row: any) => ({
    id: row.item_id,
    name: row.name || "",
    type: row.item_type,
    poster: row.poster || undefined,
    rating: row.rating || undefined,
    plot: row.plot || undefined,
    genre: row.genre || undefined,
    containerExtension: row.container_extension || undefined,
    seriesId: row.series_id || undefined,
  }));
}

// ---- Watch progress sync ----

export async function pushWatchProgress(store: Record<string, WatchEntry>) {
  if (!_userId) return;
  await supabase.from("user_watch_progress").delete().eq("user_id", _userId);
  const entries = Object.entries(store);
  if (entries.length === 0) return;
  const rows = entries.map(([key, val]) => ({
    user_id: _userId!,
    progress_key: key,
    progress: val.progress,
    time_position: val.currentTime,
    total_duration: val.duration,
    updated_at: new Date(val.updatedAt).toISOString(),
  }));
  // Insert in batches of 100
  for (let i = 0; i < rows.length; i += 100) {
    await supabase.from("user_watch_progress").insert(rows.slice(i, i + 100));
  }
}

export async function pullWatchProgress(): Promise<Record<string, WatchEntry>> {
  if (!_userId) return {};
  const { data } = await supabase
    .from("user_watch_progress")
    .select("*")
    .eq("user_id", _userId);
  if (!data) return {};
  const store: Record<string, WatchEntry> = {};
  for (const row of data) {
    store[row.progress_key] = {
      progress: row.progress,
      currentTime: row.time_position,
      duration: row.total_duration,
      updatedAt: new Date(row.updated_at).getTime(),
    };
  }
  return store;
}

// ---- Full sync on login ----

export async function syncOnLogin() {
  if (!_userId) return;

  // Pull cloud data
  const [cloudSettings, cloudFavs, cloudProgress] = await Promise.all([
    pullSettings(),
    pullFavorites(),
    pullWatchProgress(),
  ]);

  // Merge: cloud wins for settings if exists, otherwise push local
  const SETTINGS_KEY = "iptv-settings";
  if (cloudSettings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(cloudSettings));
  } else {
    try {
      const local = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (local.language || local.accentColor) {
        await pushSettings(local);
      }
    } catch {}
  }

  // Merge favorites: cloud wins if exists
  const FAVS_KEY = "iptv-favorites";
  if (cloudFavs.length > 0) {
    localStorage.setItem(FAVS_KEY, JSON.stringify(cloudFavs));
  } else {
    try {
      const local: FavoriteEntry[] = JSON.parse(localStorage.getItem(FAVS_KEY) || "[]");
      if (local.length > 0) {
        await pushFavorites(local);
      }
    } catch {}
  }

  // Merge progress: merge by key, newest wins
  const PROGRESS_KEY = "iptv-watch-progress";
  try {
    const localStore: Record<string, WatchEntry> = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    const merged = { ...cloudProgress };
    let changed = false;
    for (const [key, val] of Object.entries(localStore)) {
      if (!merged[key] || val.updatedAt > merged[key].updatedAt) {
        merged[key] = val;
        changed = true;
      }
    }
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(merged));
    if (changed) {
      await pushWatchProgress(merged);
    }
  } catch {}
}

// Debounced push helpers
let settingsTimer: number | null = null;
export function debouncedPushSettings(settings: AppSettings) {
  if (!_userId) return;
  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = window.setTimeout(() => pushSettings(settings), 2000);
}

let favsTimer: number | null = null;
export function debouncedPushFavorites(favorites: FavoriteEntry[]) {
  if (!_userId) return;
  if (favsTimer) clearTimeout(favsTimer);
  favsTimer = window.setTimeout(() => pushFavorites(favorites), 2000);
}

let progressTimer: number | null = null;
export function debouncedPushProgress() {
  if (!_userId) return;
  if (progressTimer) clearTimeout(progressTimer);
  progressTimer = window.setTimeout(() => {
    try {
      const store = JSON.parse(localStorage.getItem("iptv-watch-progress") || "{}");
      pushWatchProgress(store);
    } catch {}
  }, 10000);
}
