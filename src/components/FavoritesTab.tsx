import { Film, Clapperboard, Radio, Play, Star, Heart, Trash2 } from "lucide-react";
import type { FavoriteEntry } from "@/lib/favorites";
import type { ContentType } from "@/types/xtream";

interface FavoritesTabProps {
  entries: FavoriteEntry[];
  onPlay: (entry: FavoriteEntry) => void;
  onRemove: (entry: FavoriteEntry) => void;
  accentColor?: string;
  lang?: string;
}

function typeIcon(type: ContentType) {
  if (type === "live") return <Radio className="w-4 h-4 text-red-400" />;
  if (type === "vod") return <Film className="w-4 h-4 text-blue-400" />;
  return <Clapperboard className="w-4 h-4 text-green-400" />;
}

function typeLabel(type: ContentType) {
  if (type === "live") return "Channel";
  if (type === "vod") return "Movie";
  return "Series";
}

export default function FavoritesTab({ entries, onPlay, onRemove }: FavoritesTabProps) {
  const liveEntries = entries.filter((e) => e.type === "live");
  const vodEntries = entries.filter((e) => e.type === "vod");
  const seriesEntries = entries.filter((e) => e.type === "series");

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Heart className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No favorites yet</p>
          <p className="text-gray-600 text-xs mt-1">Use the heart icon to save your favorite content</p>
        </div>
      </div>
    );
  }

  const renderSection = (title: string, items: FavoriteEntry[]) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-8">
        <h3 className="text-white font-semibold text-sm mb-4 px-6">{title}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 px-6">
          {items.map((entry) => (
            <div key={`${entry.type}-${entry.id}`} className="group">
              <button
                onClick={() => onPlay(entry)}
                className="relative rounded-lg overflow-hidden transition-all duration-200 hover:scale-[1.05] hover:z-10 w-full"
              >
                <div className="aspect-[2/3] bg-[#1a1e2a] rounded-lg overflow-hidden relative">
                  {entry.poster ? (
                    <img
                      src={entry.poster}
                      alt={entry.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {typeIcon(entry.type)}
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                    <div className="flex items-center justify-center">
                      <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center">
                        <Play className="w-4 h-4 text-black fill-black ml-0.5" />
                      </div>
                    </div>
                  </div>

                  {entry.rating && Number(entry.rating) > 0 && (
                    <div className="absolute top-1.5 left-1.5 bg-black/70 text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                      {Number(entry.rating).toFixed(1)}
                    </div>
                  )}

                  <div className="absolute top-1.5 right-1.5">
                    <span className="bg-black/70 text-[10px] font-medium px-1.5 py-0.5 rounded text-gray-300">
                      {typeLabel(entry.type)}
                    </span>
                  </div>
                </div>
              </button>

              <div className="flex items-start gap-1 mt-1.5">
                <p className="text-gray-400 text-xs font-medium line-clamp-2 leading-tight flex-1 group-hover:text-white transition-colors">
                  {entry.name}
                </p>
                <button
                  onClick={() => onRemove(entry)}
                  className="flex-shrink-0 mt-0.5 p-0.5"
                  title="Remove from favorites"
                >
                  <Trash2 className="w-3.5 h-3.5 text-gray-600 hover:text-red-400 transition-colors" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto sidebar-scroll py-6">
      {renderSection("Channels", liveEntries)}
      {renderSection("Movies", vodEntries)}
      {renderSection("TV Series", seriesEntries)}
    </div>
  );
}
