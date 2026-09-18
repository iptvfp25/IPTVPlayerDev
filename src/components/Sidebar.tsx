import { useMemo, useState } from "react";
import { ChevronLeft, Loader2, Search, Radio, Heart } from "lucide-react";
import type { Category, EpisodeItem, ContentType } from "@/types/xtream";

export type SidebarLevel = "categories" | "items" | "episodes";

export interface SidebarItem {
  id: string;
  name: string;
  categoryId: string;
  icon?: string;
  containerExtension?: string;
  seriesId?: number;
  poster?: string;
  rating?: string;
  plot?: string;
  genre?: string;
}

interface SidebarProps {
  activeTab: ContentType;
  level: SidebarLevel;
  categories: Category[];
  items: SidebarItem[];
  episodes: EpisodeItem[];
  loading: boolean;
  error: string;
  selectedCategory: string | null;
  selectedItem: string | null;
  onCategoryClick: (categoryId: string) => void;
  onItemClick: (item: SidebarItem) => void;
  onEpisodeClick: (episode: EpisodeItem, seriesName: string) => void;
  onBackToCategories: () => void;
  onBackToItems: () => void;
  currentSeriesName: string;
  accentColor?: string;
  allStreams?: SidebarItem[];
  favorites?: Set<string>;
  onToggleFavorite?: (item: SidebarItem) => void;
}

export default function Sidebar({
  level,
  categories,
  items,
  loading,
  error,
  selectedCategory,
  selectedItem,
  accentColor = "#e91e63",
  onCategoryClick,
  onItemClick,
  onBackToCategories,
  allStreams = [],
  favorites,
  onToggleFavorite,
}: SidebarProps) {
  const [search, setSearch] = useState("");

  const filteredCategories = useMemo(() => {
    if (!search) return categories;
    const q = search.toLowerCase();
    return categories.filter((c) => c.category_name.toLowerCase().includes(q));
  }, [categories, search]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  const searchResults = useMemo(() => {
    if (level !== "categories" || search.length < 2 || allStreams.length === 0) {
      return [];
    }
    const q = search.toLowerCase();
    return allStreams.filter((s) => s.name.toLowerCase().includes(q));
  }, [level, search, allStreams]);

  const favoriteChannels = useMemo(() => {
    if (!favorites || favorites.size === 0 || allStreams.length === 0) return [];
    return allStreams.filter((s) => favorites.has(`live:${s.id}`));
  }, [favorites, allStreams]);

  const isGlobalSearch = level === "categories" && search.length >= 2 && allStreams.length > 0;

  const renderChannelRow = (item: SidebarItem, active: boolean) => {
    const isFav = favorites?.has(`live:${item.id}`) ?? false;
    return (
      <div key={item.id} className="flex items-center gap-1">
        <button
          onClick={() => onItemClick(item)}
          className={`flex-1 text-left px-3 py-3 rounded-lg text-sm transition-all hover:scale-[1.02] border-l-2 ${
            active ? "text-white font-medium" : "text-gray-300 hover:bg-white/5 border-transparent"
          }`}
          style={active ? { borderColor: accentColor, background: `linear-gradient(to right, ${accentColor}20, transparent)` } : undefined}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="truncate">{item.name}</span>
          </div>
        </button>
        {onToggleFavorite && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(item); }}
            className="flex-shrink-0 pr-2"
            title={isFav ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart
              className={`w-4 h-4 transition-colors ${isFav ? "fill-current" : "text-gray-600 hover:text-current"}`}
              style={{ color: isFav ? accentColor : undefined }}
            />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="w-[480px] flex-shrink-0 bg-[#141822] flex flex-col h-full border-l border-white/5">
      <div className="p-4 pb-3 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${level === "categories" ? "channels" : "channels"}...`}
            className="w-full bg-[#0d0f14] border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none transition-colors"
            style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
            onFocus={(e) => { e.target.style.borderColor = accentColor; }}
            onBlur={(e) => { e.target.style.borderColor = ""; }}
          />
        </div>
      </div>

      {level === "items" && (
        <button
          onClick={onBackToCategories}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors text-left group flex-shrink-0"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          All categories
        </button>
      )}

      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: accentColor }} />
          </div>
        )}

        {!loading && error && (
          <div className="px-4 py-8 text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && level === "categories" && (
          <div className="space-y-1 px-2">
            {isGlobalSearch ? (
              <>
                <div className="px-3 py-2 text-xs font-medium text-gray-500">
                  {searchResults.length} channel{searchResults.length !== 1 ? "s" : ""} found
                </div>
                {searchResults.length === 0 && (
                  <div className="px-3 py-8 text-center text-gray-500 text-sm">No channels found.</div>
                )}
                {searchResults.map((item) => renderChannelRow(item, selectedItem === item.id))}
              </>
            ) : (
              <>
                {favoriteChannels.length > 0 && (
                  <div className="mb-3">
                    <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <Heart className="w-3 h-3 fill-current" style={{ color: accentColor }} />
                      Favorites
                    </div>
                    {favoriteChannels.map((item) => renderChannelRow(item, selectedItem === item.id))}
                    <div className="h-px bg-white/5 my-2 mx-3" />
                  </div>
                )}

                {filteredCategories.length === 0 && (
                  <div className="px-3 py-8 text-center text-gray-500 text-sm">No categories found.</div>
                )}
                {filteredCategories.map((cat) => {
                  const active = selectedCategory === cat.category_id;
                  return (
                    <button
                      key={cat.category_id}
                      onClick={() => onCategoryClick(cat.category_id)}
                      className={`w-full text-left px-3 py-3 rounded-lg text-sm transition-all hover:scale-[1.02] hover:bg-white/5 border-l-2 ${
                        active ? "text-white font-medium" : "text-gray-400 border-transparent"
                      }`}
                      style={active ? { borderColor: accentColor, background: `linear-gradient(to right, ${accentColor}20, transparent)` } : undefined}
                    >
                      <div className="flex items-center gap-3">
                        <Radio className="w-4 h-4 flex-shrink-0 text-gray-500" />
                        <span className="truncate">{cat.category_name}</span>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}

        {!loading && !error && level === "items" && (
          <div className="space-y-1 px-2">
            {filteredItems.length === 0 && (
              <div className="px-3 py-8 text-center text-gray-500 text-sm">No channels found.</div>
            )}
            {filteredItems.map((item) => renderChannelRow(item, selectedItem === item.id))}
          </div>
        )}
      </div>
    </div>
  );
}
