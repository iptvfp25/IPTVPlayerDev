import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Film, Clapperboard, Star, Play, Loader2, Heart, Eye, Download } from "lucide-react";
import { XtreamClient } from "@/lib/xtream";
import type { Category } from "@/types/xtream";
import { isWatched, makeKey } from "@/lib/watchProgress";
import { addDownload, triggerDownload } from "@/lib/downloads";

export interface BrowseItem {
  id: string;
  name: string;
  categoryId: string;
  containerExtension?: string;
  seriesId?: number;
  poster?: string;
  rating?: string;
  plot?: string;
  genre?: string;
}

interface CategoryRow {
  category: Category;
  items: BrowseItem[];
  loading: boolean;
}

interface NetflixBrowseProps {
  client: XtreamClient;
  contentType: "vod" | "series";
  onItemClick: (item: BrowseItem) => void;
  favorites: Set<string>;
  onToggleFavorite: (item: BrowseItem) => void;
  accentColor?: string;
}

function handleDownloadVod(item: BrowseItem, client: XtreamClient) {
  const ext = item.containerExtension || "mp4";
  const url = client.getVodUrl(Number(item.id), ext);
  const entry = addDownload({
    id: item.id,
    type: "vod",
    name: item.name,
    url,
    poster: item.poster,
    rating: item.rating,
    genre: item.genre,
  });
  triggerDownload(entry);
}

const browseCache: Record<string, CategoryRow[]> = {};
type BrowseListener = (rows: CategoryRow[]) => void;
const browseListeners: Record<string, Set<BrowseListener>> = { vod: new Set(), series: new Set() };
const browseLoadingPromises: Record<string, Promise<void> | undefined> = {};

function notifyBrowseUpdate(contentType: "vod" | "series", rows: CategoryRow[]) {
  browseCache[contentType] = rows;
  browseListeners[contentType].forEach((listener) => listener(rows));
}

// Fetches categories fast first (small payload -> rows + spinners appear
// almost instantly), then fetches the full catalog in ONE request (instead
// of one request per category) and groups items into their categories
// locally in JS once that resolves.
//
// The full-catalog request is the slow part on some Xtream panels -- an
// unfiltered "get_vod_streams" / "get_series" dump is a heavier query on
// their end than a single filtered category, so this can genuinely take a
// few seconds server-side regardless of what we do client-side. Showing
// categories with spinners immediately (instead of a blank screen while
// everything loads) makes that wait feel responsive instead of frozen.
//
// Safe to call multiple times -- if a load is already in flight or already
// cached, it reuses it instead of re-fetching. LoginScreen kicks this off
// for both "vod" and "series" during the login screen so switching to those
// tabs for the first time doesn't show a full loading spinner.
export function preloadBrowseData(client: XtreamClient, contentType: "vod" | "series"): Promise<void> {
  if (browseCache[contentType] && browseCache[contentType].length > 0) {
    return Promise.resolve();
  }
  if (browseLoadingPromises[contentType]) {
    return browseLoadingPromises[contentType]!;
  }

  const promise = (async () => {
    try {
      const cats =
        contentType === "vod" ? await client.getVodCategories() : await client.getSeriesCategories();
      const initialRows: CategoryRow[] = cats.map((cat) => ({ category: cat, items: [], loading: true }));
      notifyBrowseUpdate(contentType, initialRows);

      const allItems =
        contentType === "vod" ? await client.getVodStreams() : await client.getSeries();

      const byCategory = new Map<string, BrowseItem[]>();
      for (const raw of allItems as any[]) {
        const item: BrowseItem =
          contentType === "vod"
            ? {
                id: String(raw.stream_id),
                name: raw.name,
                categoryId: raw.category_id,
                containerExtension: raw.container_extension,
                poster: raw.stream_icon || undefined,
                rating: raw.rating || undefined,
              }
            : {
                id: String(raw.series_id),
                name: raw.name,
                categoryId: raw.category_id,
                seriesId: raw.series_id,
                poster: raw.cover || undefined,
                rating: raw.rating || undefined,
                plot: raw.plot || undefined,
                genre: raw.genre || undefined,
              };
        const list = byCategory.get(item.categoryId);
        if (list) list.push(item);
        else byCategory.set(item.categoryId, [item]);
      }

      const rows: CategoryRow[] = cats.map((cat) => ({
        category: cat,
        items: byCategory.get(cat.category_id) || [],
        loading: false,
      }));
      notifyBrowseUpdate(contentType, rows);
    } finally {
      browseLoadingPromises[contentType] = undefined;
    }
  })();

  browseLoadingPromises[contentType] = promise;
  return promise;
}

const PosterCard = memo(function PosterCard({
  item,
  contentType,
  onClick,
  isFav,
  onToggleFav,
  accentColor = "#e91e63",
  onDownload,
}: {
  item: BrowseItem;
  contentType: "vod" | "series";
  onClick: () => void;
  isFav: boolean;
  onToggleFav: () => void;
  accentColor?: string;
  onDownload?: () => void;
}) {
  const watched = isWatched(
    contentType === "vod"
      ? makeKey("vod", Number(item.id))
      : makeKey("series", Number(item.seriesId || item.id))
  );

  return (
    <div
      className="flex-shrink-0 w-[150px] group"
      style={{ contentVisibility: "auto", containIntrinsicSize: "150px 260px" } as React.CSSProperties}
    >
      <button
        onClick={onClick}
        className="relative rounded-lg overflow-hidden transition-all duration-200 hover:scale-[1.08] hover:z-10 w-full"
      >
        <div className="aspect-[2/3] bg-[#1a1e2a] rounded-lg overflow-hidden relative">
          {item.poster ? (
            <img
              src={item.poster}
              alt={item.name}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {contentType === "vod" ? (
                <Film className="w-8 h-8 text-gray-700" />
              ) : (
                <Clapperboard className="w-8 h-8 text-gray-700" />
              )}
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
            <div className="flex items-center justify-center">
              <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center">
                <Play className="w-4 h-4 text-black fill-black ml-0.5" />
              </div>
            </div>
          </div>

          {item.rating && Number(item.rating) > 0 && (
            <div className="absolute top-1.5 left-1.5 bg-black/70 text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
              {Number(item.rating).toFixed(1)}
            </div>
          )}

          {watched && (
            <div className="absolute top-1.5 right-1.5 text-white rounded p-0.5" style={{ backgroundColor: `${accentColor}cc` }}>
              <Eye className="w-3 h-3" />
            </div>
          )}
        </div>
      </button>

      <div className="flex items-start gap-1 mt-1.5">
        <p className="text-gray-400 text-xs font-medium line-clamp-2 leading-tight flex-1 group-hover:text-white transition-colors">
          {item.name}
        </p>
        {onDownload && (
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            className="flex-shrink-0 mt-0.5 mr-0.5"
            title="Download"
          >
            <Download className="w-3.5 h-3.5 text-gray-600 hover:text-white transition-colors" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
          className="flex-shrink-0 mt-0.5"
          title={isFav ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart
            className={`w-3.5 h-3.5 transition-colors ${isFav ? "fill-current" : "text-gray-600 hover:text-current"}`}
            style={{ color: isFav ? accentColor : undefined }}
            onMouseEnter={(e) => { if (!isFav) (e.target as SVGElement).style.color = accentColor; }}
            onMouseLeave={(e) => { if (!isFav) (e.target as SVGElement).style.color = ""; }}
          />
        </button>
      </div>
    </div>
  );
});

const HorizontalRow = memo(function HorizontalRow({
  row,
  contentType,
  onItemClick,
  favorites,
  onToggleFavorite,
  accentColor = "#e91e63",
  client,
}: {
  row: CategoryRow;
  contentType: "vod" | "series";
  onItemClick: (item: BrowseItem) => void;
  favorites: Set<string>;
  onToggleFavorite: (item: BrowseItem) => void;
  accentColor?: string;
  client: XtreamClient;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    return () => el.removeEventListener("scroll", checkScroll);
  }, [checkScroll, row.items]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -600 : 600, behavior: "smooth" });
  };

  if (row.loading) {
    return (
      <div className="mb-8">
        <h3 className="text-white font-semibold text-sm mb-3 px-6">{row.category.category_name}</h3>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: accentColor }} />
        </div>
      </div>
    );
  }

  if (row.items.length === 0) return null;

  const favKey = contentType === "vod" ? "vod" : "series";

  return (
    <div
      className="mb-8 group/row"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 300px" } as React.CSSProperties}
    >
      <h3 className="text-white font-semibold text-sm mb-3 px-6">{row.category.category_name}</h3>
      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-0 bottom-6 w-10 z-10 bg-gradient-to-r from-[#0d0f14] to-transparent flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto px-6 scrollbar-hide"
          style={{ scrollbarWidth: "none" }}
        >
          {row.items.map((item) => (
            <PosterCard
              key={item.id}
              item={item}
              contentType={contentType}
              onClick={() => onItemClick(item)}
              isFav={favorites.has(`${favKey}:${item.id}`)}
              onToggleFav={() => onToggleFavorite(item)}
              accentColor={accentColor}
              onDownload={contentType === "vod" ? () => handleDownloadVod(item, client) : undefined}
            />
          ))}
        </div>

        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 top-0 bottom-6 w-10 z-10 bg-gradient-to-l from-[#0d0f14] to-transparent flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        )}
      </div>
    </div>
  );
});

export default function NetflixBrowse({
  client,
  contentType,
  onItemClick,
  favorites,
  onToggleFavorite,
  accentColor = "#e91e63",
}: NetflixBrowseProps) {
  const [rows, setRows] = useState<CategoryRow[]>(() => browseCache[contentType] || []);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(browseCache[contentType] || []);
    setError("");

    const listener: BrowseListener = (r) => setRows(r);
    browseListeners[contentType].add(listener);

    preloadBrowseData(client, contentType).catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      browseListeners[contentType].delete(listener);
    };
  }, [client, contentType]);

  const loading = rows.length === 0 && !error;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: accentColor }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="py-4">
      {rows.map((row) => (
        <HorizontalRow
          key={row.category.category_id}
          row={row}
          contentType={contentType}
          onItemClick={onItemClick}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
          accentColor={accentColor}
          client={client}
        />
      ))}
    </div>
  );
}
