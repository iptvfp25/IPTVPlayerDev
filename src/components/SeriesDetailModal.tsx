import { useEffect, useMemo, useState } from "react";
import { X, Play, Star, ChevronDown, Loader2, Eye, SkipForward, Download } from "lucide-react";
import type { EpisodeItem } from "@/types/xtream";
import { XtreamClient } from "@/lib/xtream";
import { isWatched, getEpisodeProgress, getNextEpisode, makeEpisodeKey } from "@/lib/watchProgress";
import { addDownload, triggerDownload } from "@/lib/downloads";

interface SeriesDetailModalProps {
  client: XtreamClient;
  seriesId: number;
  seriesName: string;
  poster?: string;
  rating?: string;
  plot?: string;
  genre?: string;
  onClose: () => void;
  onPlayEpisode: (episode: EpisodeItem, seriesName: string) => void;
  accentColor?: string;
  lang?: string;
}

export default function SeriesDetailModal({
  client,
  seriesId,
  seriesName,
  poster,
  rating,
  plot,
  genre,
  onClose,
  onPlayEpisode,
  accentColor = "#e91e63",
}: SeriesDetailModalProps) {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [allEpisodes, setAllEpisodes] = useState<Record<string, EpisodeItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const episodes = useMemo(
    () => allEpisodes[String(selectedSeason)] || [],
    [allEpisodes, selectedSeason]
  );

  // All episodes flattened for next-episode detection
  const allFlat = useMemo(() => {
    const flat: EpisodeItem[] = [];
    for (const key of Object.keys(allEpisodes).sort((a, b) => Number(a) - Number(b))) {
      flat.push(...allEpisodes[key]);
    }
    return flat;
  }, [allEpisodes]);

  const nextEp = useMemo(
    () => getNextEpisode(seriesId, allFlat),
    [seriesId, allFlat]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const info = await client.getSeriesInfo(seriesId);
        if (cancelled) return;

        const seasonKeys = Object.keys(info.episodes || {})
          .map(Number)
          .filter((n) => !isNaN(n))
          .sort((a, b) => a - b);

        if (seasonKeys.length === 0) {
          setError("No episodes available for this series.");
          setLoading(false);
          return;
        }

        setSeasons(seasonKeys);

        // Build all episodes at once so we don't need to re-fetch on season change
        const episodeMap: Record<string, EpisodeItem[]> = {};
        for (const sk of seasonKeys) {
          episodeMap[String(sk)] = (info.episodes[String(sk)] || []).map((ep: any) => {
            const eid = Number(ep.episode_id) || Number(ep.stream_id) || Number(ep.id) || 0;
            return {
              episode_id: eid,
              title: `E${ep.episode_num} - ${ep.title || `Episode ${ep.episode_num}`}`,
              season: sk,
              container_extension: ep.container_extension || "mp4",
            };
          });
        }
        if (!cancelled) {
          setAllEpisodes(episodeMap);
          // Auto-select season of next unwatched episode
          if (nextEp) {
            setSelectedSeason(nextEp.season);
          } else {
            setSelectedSeason(seasonKeys[0]);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [client, seriesId]);

  // Once allFlat loads, set season to next episode's season
  useEffect(() => {
    if (allFlat.length === 0) return;
    const next = getNextEpisode(seriesId, allFlat);
    if (next) {
      setSelectedSeason(next.season);
    }
  }, [seriesId, allFlat]);

  const handleSeasonChange = (season: number) => {
    setSelectedSeason(season);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#141822] rounded-2xl border border-white/10 max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with backdrop */}
        <div className="relative flex-shrink-0">
          {poster ? (
            <div className="h-48 w-full overflow-hidden relative">
              <img
                src={poster}
                alt={seriesName}
                className="w-full h-full object-cover opacity-40"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#141822] via-[#141822]/60 to-transparent" />
            </div>
          ) : (
            <div className="h-32 bg-gradient-to-br from-[#1a1e2a] to-[#0d0f14]" />
          )}

          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end gap-4">
            {poster && (
              <img
                src={poster}
                alt={seriesName}
                className="w-24 h-36 rounded-lg object-cover flex-shrink-0 border border-white/10 shadow-xl"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-bold text-2xl mb-2 truncate">{seriesName}</h2>
              <div className="flex items-center gap-3 text-xs">
                {rating && Number(rating) > 0 && (
                  <span className="flex items-center gap-1 text-yellow-400 font-medium">
                    <Star className="w-3 h-3 fill-yellow-400" />
                    {Number(rating).toFixed(1)}
                  </span>
                )}
                {genre && <span className="text-gray-400">{genre}</span>}
              </div>
            </div>
          </div>
        </div>

        {plot && (
          <div className="px-6 pt-3 pb-2 flex-shrink-0">
            <p className="text-gray-400 text-sm leading-relaxed line-clamp-3">{plot}</p>
          </div>
        )}

        {/* Next episode suggestion */}
        {!loading && nextEp && (
          <div className="px-6 pt-2 pb-1 flex-shrink-0">
            <button
              onClick={() => {
                const ep = allFlat.find((e) => e.episode_id === nextEp.episode_id);
                if (ep) {
                  onPlayEpisode(ep, seriesName);
                  onClose();
                }
              }}
              className="flex items-center gap-3 w-full p-3 rounded-lg border transition-all group"
              style={{ background: `linear-gradient(to right, ${accentColor}33, ${accentColor}0d)`, borderColor: `${accentColor}4d` }}
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: accentColor }}>
                <SkipForward className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: accentColor }}>Continue watching</p>
                <p className="text-white text-sm font-medium truncate">
                  S{nextEp.season} {allFlat.find((e) => e.episode_id === nextEp.episode_id)?.title}
                </p>
              </div>
              <Play className="w-5 h-5 group-hover:text-white transition-colors" style={{ color: accentColor }} />
            </button>
          </div>
        )}

        {/* Season selector */}
        {seasons.length > 0 && (
          <div className="px-6 py-3 flex-shrink-0">
            <div className="relative inline-block">
              <select
                value={selectedSeason}
                onChange={(e) => handleSeasonChange(Number(e.target.value))}
                className="appearance-none bg-[#0d0f14] border border-white/10 rounded-lg pl-4 pr-10 py-2 text-white text-sm font-medium focus:outline-none cursor-pointer"
                onFocus={(e) => { e.target.style.borderColor = accentColor; }}
                onBlur={(e) => { e.target.style.borderColor = ''; }}
              >
                {seasons.map((s) => (
                  <option key={s} value={s}>Season {s}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Episodes list */}
        <div className="flex-1 overflow-y-auto sidebar-scroll px-6 pb-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: accentColor }} />
            </div>
          )}

          {!loading && error && (
            <div className="py-8 text-center">
              <p className="text-gray-500 text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && episodes.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-gray-500 text-sm">No episodes found for this season.</p>
            </div>
          )}

          {!loading && !error && episodes.length > 0 && (
            <div className="space-y-2">
              {episodes.map((ep) => {
                const watched = isWatched(makeEpisodeKey(seriesId, ep.episode_id));
                const progress = getEpisodeProgress(seriesId, ep.episode_id);
                const progressPct = progress ? progress.progress : 0;
                const isNext = nextEp?.episode_id === ep.episode_id;

                return (
                  <div
                    key={ep.episode_id}
                    onClick={() => {
                      onPlayEpisode(ep, seriesName);
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border transition-all group text-left hover:bg-[#1a1e2a] cursor-pointer"
                    style={isNext ? { backgroundColor: `${accentColor}1a`, borderColor: `${accentColor}4d` } : { backgroundColor: '#0d0f14', borderColor: 'rgba(255,255,255,0.05)' }}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{ backgroundColor: watched ? '#374151' : isNext ? accentColor : '#1a1e2a' }}
                    >
                      {watched ? (
                        <Eye className="w-4 h-4 text-gray-400" />
                      ) : (
                        <Play className="w-4 h-4 text-gray-400 group-hover:text-white fill-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate transition-colors ${
                        watched ? "text-gray-500" : "text-gray-200 group-hover:text-white"
                      }`}>
                        {ep.title}
                      </p>
                      {/* Progress bar */}
                      {progressPct > 0 && progressPct < 90 && (
                        <div className="mt-1.5 h-1 bg-gray-700 rounded-full overflow-hidden w-full max-w-[200px]">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${progressPct}%`, backgroundColor: accentColor }}
                          />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const url = client.getEpisodeUrl(ep.episode_id, ep.container_extension);
                        const dl = addDownload({
                          id: String(ep.episode_id),
                          type: "series",
                          name: ep.title,
                          url,
                          poster,
                          genre,
                          seriesName,
                          season: ep.season,
                        });
                        triggerDownload(dl);
                      }}
                      className="flex-shrink-0 p-1.5 text-gray-600 hover:text-white transition-colors"
                      title="Download episode"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    {watched && (
                      <span className="text-[10px] text-gray-600 font-medium uppercase tracking-wider flex-shrink-0">
                        Watched
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>


      </div>
    </div>
  );
}
