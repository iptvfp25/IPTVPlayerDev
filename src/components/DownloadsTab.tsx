import { useState } from "react";
import {
  Download,
  Film,
  Clapperboard,
  Trash2,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import {
  getDownloads,
  removeDownload,
  triggerDownload,
  type DownloadEntry,
} from "@/lib/downloads";
import { t, type AppLanguage } from "@/lib/settings";

interface DownloadsTabProps {
  accentColor?: string;
  lang?: AppLanguage;
}

export default function DownloadsTab({ accentColor = "#e91e63", lang = "en" }: DownloadsTabProps) {
  const [entries, setEntries] = useState<DownloadEntry[]>(() => getDownloads());

  const refresh = () => setEntries(getDownloads());

  const handleDownload = (entry: DownloadEntry) => {
    triggerDownload(entry);
    refresh();
  };

  const handleRemove = (entry: DownloadEntry) => {
    removeDownload(entry.id, entry.type);
    refresh();
  };

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Download className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t(lang, "noDownloads")}</p>
          <p className="text-gray-600 text-xs mt-1">{t(lang, "noDownloadsHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto sidebar-scroll py-6">
      <div className="px-6 mb-4">
        <h3 className="text-white font-semibold text-sm">{t(lang, "downloads")}</h3>
        <p className="text-gray-600 text-xs mt-1">{entries.length} {entries.length === 1 ? "item" : "items"}</p>
      </div>
      <div className="space-y-2 px-6">
        {entries.map((entry) => {
          const key = `${entry.type}:${entry.id}`;
          return (
            <div
              key={key}
              className="flex items-center gap-3 p-3 rounded-lg bg-[#141822] border border-white/5 transition-all"
            >
              {entry.poster ? (
                <img
                  src={entry.poster}
                  alt={entry.name}
                  className="w-12 h-16 rounded object-cover flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-12 h-16 rounded bg-[#0d0f14] flex items-center justify-center flex-shrink-0">
                  {entry.type === "vod" ? (
                    <Film className="w-4 h-4 text-blue-400" />
                  ) : (
                    <Clapperboard className="w-4 h-4 text-green-400" />
                  )}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{entry.name}</p>
                {entry.seriesName && (
                  <p className="text-gray-500 text-xs truncate">{entry.seriesName}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">
                    {entry.type === "vod" ? t(lang, "movies") : t(lang, "series")}
                  </span>
                  {entry.status === "complete" && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" /> {t(lang, "download")}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleDownload(entry)}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:opacity-80"
                  style={{ backgroundColor: accentColor }}
                  title={t(lang, "download")}
                >
                  {entry.status === "complete" ? (
                    <ExternalLink className="w-4 h-4 text-white" />
                  ) : (
                    <Download className="w-4 h-4 text-white" />
                  )}
                </button>
                <button
                  onClick={() => handleRemove(entry)}
                  className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
