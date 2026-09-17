import { useCallback, useEffect, useRef, useState } from "react";
import { Search as SearchIcon, Loader2, Film, Clapperboard, Radio, Play, Star, Heart } from "lucide-react";
import { XtreamClient } from "@/lib/xtream";
import type { ContentType } from "@/types/xtream";
import type { BrowseItem } from "@/components/NetflixBrowse";

interface SearchResult {
  item: BrowseItem;
  type: ContentType;
}

interface CachedStreams {
  live: { stream_id: number; name: string; category_id: string }[];
  vod: { stream_id: number; name: string; category_id: string; container_extension: string; stream_icon: string; rating: string }[];
  series: { series_id: number; name: string; category_id: string; cover: string; rating: string; plot: string; genre: string }[];
}

interface SearchTabProps {
  client: XtreamClient;
  onPlayLive: (streamId: number, name: string) => void;
  onPlayVod: (streamId: number, ext: string, name: string) => void;
  onOpenSeries: (item: BrowseItem) => void;
  favorites: Set<string>;
  onToggleFavorite: (item: BrowseItem, type: ContentType) => void;
  accentColor?: string;
  lang?: string;
}

const streamCache: { data: CachedStreams | null; loading: boolean } = { data: null, loading: false };

export default function SearchTab({
  client,
  onPlayLive,
  onPlayVod,
  onOpenSeries,
  favorites,
  onToggleFavorite,
  accentColor = "#e91e63",
}: SearchTabProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [cacheReady, setCacheReady] = useState(!!streamCache.data);
  const debounceRef = useRef<number>(0);

  // Load all streams once (cached across mounts)
  useEffect(() => {
    if (streamCache.data) {
      setCacheReady(true);
      return;
    }
    if (streamCache.loading) {
      const check = setInterval(() => {
        if (streamCache.data) { setCacheReady(true); clearInterval(check); }
      }, 200);
      return () => clearInterval(check);
    }

    streamCache.loading = true;
    setLoading(true);

    (async () => {
      const [live, vod, series] = await Promise.allSettled([
        client.getLiveStreams(),
        client.getVodStreams(),
        client.getSeries(),
      ]);

      streamCache.data = {
        live: live.status === "fulfilled" ? live.value : [],
        vod: vod.status === "fulfilled" ? vod.value : [],
        series: series.status === "fulfilled" ? series.value : [],
      };
      streamCache.loading = false;
      setCacheReady(true);
      setLoading(false);
    })();
  }, [client]);

  const filterResults = useCallback((q: string) => {
    if (!streamCache.data || q.trim().length < 2) {
      setResults([]);
      return;
    }

    const needle = q.toLowerCase();
    const all: SearchResult[] = [];

    for (const s of streamCache.data.live) {
      if (s.name.toLowerCase().includes(needle)) {
        all.push({
          type: "live",
          item: { id: String(s.stream_id), name: s.name, categoryId: s.category_id },
        });
      }
    }

    for (const s of streamCache.data.vod) {
      if (s.name.toLowerCase().includes(needle)) {
        all.push({
          type: "vod",
          item: {
            id: String(s.stream_id),
            name: s.name,
            categoryId: s.category_id,
            containerExtension: s.container_extension,
            poster: s.stream_icon || undefined,
            rating: s.rating || undefined,
          },
        });
      }
    }

    for (const s of streamCache.data.series) {
      if (s.name.toLowerCase().includes(needle)) {
        all.push({
          type: "series",
          item: {
            id: String(s.series_id),
            name: s.name,
            categoryId: s.category_id,
            seriesId: s.series_id,
            poster: s.cover || undefined,
            rating: s.rating || undefined,
            plot: s.plot || undefined,
            genre: s.genre || undefined,
          },
        });
      }
    }

    setResults(all.slice(0, 100));
  }, []);

  // Debounced instant search
  useEffect(() => {
    if (!cacheReady) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => filterResults(query), 200);
    return () => window.clearTimeout(debounceRef.current);
  }, [query, cacheReady, filterResults]);

  const handleResultClick = (result: SearchResult) => {
    if (result.type === "live") {
      onPlayLive(Number(result.item.id), result.item.name);
    } else if (result.type === "vod") {
      onPlayVod(Number(result.item.id), result.item.containerExtension || "mp4", result.item.name);
    } else {
      onOpenSeries(result.item);
    }
  };

  const typeIcon = (type: ContentType) => {
    if (type === "live") return <Radio className="w-4 h-4 text-red-400" />;
    if (type === "vod") return <Film className="w-4 h-4 text-blue-400" />;
    return <Clapperboard className="w-4 h-4 text-green-400" />;
  };

  const typeLabel = (type: ContentType) => {
    if (type === "live") return "Channel";
    if (type === "vod") return "Movie";
    return "Series";
  };

  const showEmpty = cacheReady && query.trim().length >= 2 && results.length === 0;

  return (
    <div className="flex-1 overflow-y-auto sidebar-scroll">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search channels, movies, TV series..."
              className="w-full bg-[#141822] border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white placeholder-gray-600 focus:outline-none transition-all text-base"
              onFocus={(e) => { e.target.style.borderColor = accentColor; e.target.style.boxShadow = `0 0 0 2px ${accentColor}33`; }}
              onBlur={(e) => { e.target.style.borderColor = ''; e.target.style.boxShadow = ''; }}
              autoFocus
            />
            {!cacheReady && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
              </div>
            )}
          </div>
          {!cacheReady && (
            <p className="text-gray-600 text-xs mt-2">Loading content index...</p>
          )}
        </div>

        {showEmpty && (
          <div className="text-center py-16">
            <p className="text-gray-500 text-sm">No results found for "{query}"</p>
          </div>
        )}

        {results.length > 0 && (
          <div>
            <p className="text-gray-500 text-xs mb-4">{results.length} results</p>
            <div className="space-y-2">
              {results.map((result, idx) => {
                const favKey = `${result.type}:${result.item.id}`;
                const isFav = favorites.has(favKey);
                return (
                  <div
                    key={`${result.type}-${result.item.id}-${idx}`}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[#141822] border border-white/5 transition-all group"
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = `${accentColor}4d`; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = ''; }}
                  >
                    {result.item.poster ? (
                      <img
                        src={result.item.poster}
                        alt={result.item.name}
                        className="w-12 h-16 rounded object-cover flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-12 h-16 rounded bg-[#0d0f14] flex items-center justify-center flex-shrink-0">
                        {typeIcon(result.type)}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{result.item.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          {typeIcon(result.type)}
                          {typeLabel(result.type)}
                        </span>
                        {result.item.rating && Number(result.item.rating) > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-yellow-400">
                            <Star className="w-3 h-3 fill-yellow-400" />
                            {Number(result.item.rating).toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => onToggleFavorite(result.item, result.type)}
                      className="flex-shrink-0 p-1.5"
                      title={isFav ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Heart
                        className={`w-4 h-4 transition-colors ${isFav ? "fill-current" : "text-gray-600"}`}
                        style={isFav ? { color: accentColor } : undefined}
                      />
                    </button>

                    <button
                      onClick={() => handleResultClick(result)}
                      className="flex-shrink-0 w-9 h-9 rounded-full bg-[#1a1e2a] flex items-center justify-center transition-colors"
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = accentColor; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                    >
                      <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {cacheReady && query.trim().length < 2 && results.length === 0 && (
          <div className="text-center py-16">
            <SearchIcon className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Start typing to search across all content</p>
          </div>
        )}
      </div>
    </div>
  );
}
