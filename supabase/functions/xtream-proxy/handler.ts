export const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, Range",
  };
  
  const BROWSER_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  function guessContentType(path: string, fallback: string): string {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    const types: Record<string, string> = {
      mp4: "video/mp4",
      m4v: "video/x-m4v",
      mkv: "video/x-matroska",
      webm: "video/webm",
      ts: "video/mp2t",
      m3u8: "application/vnd.apple.mpegurl",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      flv: "video/x-flv",
    };
    return types[ext] || fallback;
  }
  
  export async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
  
    // Expected path: /xtream-proxy/{server}/{path...}
    // server is base64url-encoded host (host[:port]) — we prepend http:// if missing
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 3) {
      return jsonResponse({ error: "Invalid proxy path. Expected /xtream-proxy/{server}/{path}" }, 400);
    }
  
    const serverEncoded = parts[1];
    let server: string;
    try {
      server = atob(serverEncoded.replace(/-/g, "+").replace(/_/g, "/"));
    } catch {
      return jsonResponse({ error: "Invalid server encoding" }, 400);
    }
    if (!server.startsWith("http://") && !server.startsWith("https://")) {
      server = "http://" + server;
    }
    server = server.replace(/\/+$/, "");
  
    const apiPath = parts.slice(2).join("/");
    const target = `${server}/${apiPath}${url.search}`;
  
    // JSON API calls
    if (apiPath.startsWith("player_api.php")) {
      return fetchWithRetry(target);
    }
  
    // Video stream proxying (live, movie, series)
    if (
      apiPath.startsWith("live/") ||
      apiPath.startsWith("movie/") ||
      apiPath.startsWith("series/")
    ) {
      return streamProxy(req, target, apiPath);
    }
  
    return jsonResponse({ error: "Unsupported path. Only player_api.php and stream paths (live/, movie/, series/) are supported" }, 403);
  }
  
  async function streamProxy(req: Request, target: string, apiPath: string): Promise<Response> {
    const headers: Record<string, string> = {
      "User-Agent": BROWSER_UA,
      "Accept": "*/*",
    };
  
    // Pass through Range header for VOD seeking
    const range = req.headers.get("Range");
    if (range) {
      headers["Range"] = range;
    }
  
    try {
      const resp = await fetch(target, { headers });
  
      const responseHeaders: Record<string, string> = {
        ...corsHeaders,
      };
  
      // Determine Content-Type: prefer upstream, but fix common wrong values
      const upstreamCT = resp.headers.get("Content-Type") || "";
      if (upstreamCT && upstreamCT.startsWith("video/")) {
        responseHeaders["Content-Type"] = upstreamCT;
      } else if (upstreamCT === "application/octet-stream" || !upstreamCT) {
        responseHeaders["Content-Type"] = guessContentType(apiPath, "application/octet-stream");
      } else {
        responseHeaders["Content-Type"] = upstreamCT;
      }
  
      const contentLength = resp.headers.get("Content-Length");
      if (contentLength) responseHeaders["Content-Length"] = contentLength;
      const contentRange = resp.headers.get("Content-Range");
      if (contentRange) responseHeaders["Content-Range"] = contentRange;
      const acceptRanges = resp.headers.get("Accept-Ranges");
      if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;
  
      // If download=true query param, force attachment disposition
      const url = new URL(req.url);
      if (url.searchParams.get("download") === "true") {
        const filename = apiPath.split("/").pop() || "download";
        responseHeaders["Content-Disposition"] = `attachment; filename="${filename}"`;
      }
  
      return new Response(resp.body, {
        status: resp.status,
        headers: responseHeaders,
      });
    } catch (e) {
      return jsonResponse({ error: e instanceof Error ? e.message : "Stream proxy error" }, 502);
    }
  }
  
  async function fetchWithRetry(target: string, retries = 3): Promise<Response> {
    let lastErr: string | null = null;
    for (let i = 0; i < retries; i++) {
      try {
        const resp = await fetch(target, {
          headers: {
            "User-Agent": BROWSER_UA,
            "Accept": "application/json, text/plain, */*",
          },
          signal: AbortSignal.timeout(15000),
        });
        const text = await resp.text();
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
        return jsonResponse({ status: resp.status, data: body });
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        if (i < retries - 1) {
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    }
    return jsonResponse({ error: lastErr || "Request failed after retries" }, 502);
  }
  