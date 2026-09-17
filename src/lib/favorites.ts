import { useCallback, useState } from "react";
import type { ContentType } from "@/types/xtream";
import type { BrowseItem } from "@/components/NetflixBrowse";
import { debouncedPushFavorites } from "@/lib/sync";

const STORAGE_KEY = "iptv-favorites";

export interface FavoriteEntry {
  id: string;
  name: string;
  type: ContentType;
  poster?: string;
  rating?: string;
  plot?: string;
  genre?: string;
  containerExtension?: string;
  seriesId?: number;
}

function loadFavorites(): Map<string, FavoriteEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const arr: FavoriteEntry[] = JSON.parse(raw);
    const map = new Map<string, FavoriteEntry>();
    for (const entry of arr) {
      map.set(`${entry.type}:${entry.id}`, entry);
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveFavorites(map: Map<string, FavoriteEntry>) {
  const arr = Array.from(map.values());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

export function useFavorites() {
  const [favMap, setFavMap] = useState<Map<string, FavoriteEntry>>(() => loadFavorites());

  const favKeys = new Set(favMap.keys());

  const toggle = useCallback((item: BrowseItem, type: ContentType) => {
    setFavMap((prev) => {
      const next = new Map(prev);
      const key = `${type}:${item.id}`;
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, {
          id: item.id,
          name: item.name,
          type,
          poster: item.poster,
          rating: item.rating,
          plot: item.plot,
          genre: item.genre,
          containerExtension: item.containerExtension,
          seriesId: item.seriesId,
        });
      }
      saveFavorites(next);
      debouncedPushFavorites(Array.from(next.values()));
      return next;
    });
  }, []);

  const entries = Array.from(favMap.values());

  return { favKeys, toggle, entries };
}
