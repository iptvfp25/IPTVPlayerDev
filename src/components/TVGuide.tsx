import { useEffect, useState } from "react";
import { Calendar, Loader2, Clock } from "lucide-react";
import type { EpgProgram } from "@/types/xtream";
import { XtreamClient } from "@/lib/xtream";

interface TVGuideProps {
  client: XtreamClient;
  streamId: number;
  channelName: string;
}

function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function isNow(program: EpgProgram): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now >= program.start_timestamp && now < program.stop_timestamp;
}

export default function TVGuide({ client, streamId, channelName }: TVGuideProps) {
  const [epg, setEpg] = useState<EpgProgram[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!streamId) return;
    setLoading(true);
    setError("");
    setEpg([]);
    let cancelled = false;

    (async () => {
      try {
        const programs = await client.getShortEpg(streamId, 10);
        // Filter out entries with no title (garbage data)
        const valid = programs.filter((p) => p.title && p.title !== "Unknown");
        if (!cancelled) setEpg(valid);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [client, streamId]);

  return (
    <div className="bg-[#141822] rounded-xl border border-white/5 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <Calendar className="w-4 h-4 text-[#e91e63]" />
        <h3 className="text-white text-sm font-semibold">TV Guide</h3>
        <span className="text-gray-500 text-xs ml-1 truncate">{channelName}</span>
      </div>

      <div className="max-h-[320px] overflow-y-auto sidebar-scroll">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-[#e91e63] animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="px-4 py-6 text-center">
            <p className="text-gray-500 text-xs">No EPG data available</p>
          </div>
        )}

        {!loading && !error && epg.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-gray-500 text-xs">No program data available</p>
          </div>
        )}

        {!loading && !error && epg.length > 0 && (
          <div className="divide-y divide-white/5">
            {epg.map((program, idx) => {
              const now = isNow(program);
              const hasTime = program.start_timestamp > 0;
              return (
                <div
                  key={idx}
                  className={`px-4 py-3 transition-colors ${now ? "bg-[#e91e63]/10 border-l-2 border-[#e91e63]" : "hover:bg-white/5 border-l-2 border-transparent"}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-white text-sm font-medium truncate flex-1">{program.title}</span>
                    {now && (
                      <span className="bg-[#e91e63] text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0">
                        NOW
                      </span>
                    )}
                  </div>
                  {hasTime ? (
                    <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(program.start_timestamp)}</span>
                      <span>·</span>
                      <span>{formatTime(program.start_timestamp)} - {formatTime(program.stop_timestamp)}</span>
                    </div>
                  ) : program.start && (
                    <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1">
                      <Clock className="w-3 h-3" />
                      <span>{program.start}</span>
                    </div>
                  )}
                  {program.description && (
                    <p className="text-gray-600 text-xs leading-relaxed line-clamp-2">{program.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
