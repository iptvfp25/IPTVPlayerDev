const DOWNLOADS_KEY = "iptv-downloads";

export type DownloadType = "vod" | "series";

export interface DownloadEntry {
  id: string;
  type: DownloadType;
  name: string;
  url: string;
  poster?: string;
  rating?: string;
  genre?: string;
  seriesName?: string;
  season?: number;
  addedAt: number;
  status: "pending" | "complete";
}

function loadAll(): DownloadEntry[] {
  try {
    const raw = localStorage.getItem(DOWNLOADS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(entries: DownloadEntry[]) {
  localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(entries));
}

export function getDownloads(): DownloadEntry[] {
  return loadAll();
}

export function addDownload(entry: Omit<DownloadEntry, "addedAt" | "status">): DownloadEntry {
  const entries = loadAll();
  const existing = entries.find((e) => e.id === entry.id && e.type === entry.type);
  if (existing) return existing;

  const newEntry: DownloadEntry = {
    ...entry,
    addedAt: Date.now(),
    status: "pending",
  };
  entries.unshift(newEntry);
  saveAll(entries);
  return newEntry;
}

export function markComplete(id: string, type: DownloadType) {
  const entries = loadAll();
  const idx = entries.findIndex((e) => e.id === id && e.type === type);
  if (idx >= 0) {
    entries[idx].status = "complete";
    saveAll(entries);
  }
}

export function removeDownload(id: string, type: DownloadType) {
  const entries = loadAll().filter((e) => !(e.id === id && e.type === type));
  saveAll(entries);
}

export function triggerDownload(entry: DownloadEntry) {
  const downloadUrl = entry.url.includes("?")
    ? `${entry.url}&download=true`
    : `${entry.url}?download=true`;
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = `${entry.name.replace(/[^a-zA-Z0-9\s.-]/g, "")}.mp4`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  markComplete(entry.id, entry.type);
}
