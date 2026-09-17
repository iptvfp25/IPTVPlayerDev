const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

function isSafeUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed;
  } catch {}
  return null;
}

function rewritePlaylist(text: string, originalUrl: URL, proxyBase: string): string {
  const lines = text.split(/\r?\n/);
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    let target: string;
    try {
      target = new URL(trimmed, originalUrl).toString();
    } catch {
      return line;
    }
    return `${proxyBase}?target=${encodeURIComponent(target)}`;
  });
  return out.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const reqUrl = new URL(req.url);
  const proxyBase = `${reqUrl.origin}${reqUrl.pathname}`;

  if (req.method === "GET") {
    const target = reqUrl.searchParams.get("target");
    if (!target) {
      return new Response(
        JSON.stringify({ error: "Missing 'target' query parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsed = isSafeUrl(target);
    if (!parsed) {
      return new Response(
        JSON.stringify({ error: "Invalid target URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    try {
      const forwardHeaders: Record<string, string> = {
        "User-Agent": "IPTV-Desktop/1.0",
      };
      const range = req.headers.get("Range");
      if (range) forwardHeaders["Range"] = range;

      const upstream = await fetch(parsed.toString(), {
        headers: forwardHeaders,
        signal: AbortSignal.timeout(30000),
      });

      const contentType = upstream.headers.get("Content-Type") || "";
      const isPlaylist =
        contentType.includes("application/vnd.apple.mpegurl") ||
        contentType.includes("application/x-mpegurl") ||
        parsed.pathname.toLowerCase().endsWith(".m3u8");

      const respHeaders = new Headers(corsHeaders);
      const passthroughHeaders = ["Content-Length", "Content-Range", "Accept-Ranges", "Cache-Control"];
      for (const h of passthroughHeaders) {
        const v = upstream.headers.get(h);
        if (v) respHeaders.set(h, v);
      }

      if (isPlaylist) {
        const text = await upstream.text();
        const rewritten = rewritePlaylist(text, parsed, proxyBase);
        respHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
        respHeaders.delete("Content-Length");
        return new Response(rewritten, { status: upstream.status, headers: respHeaders });
      }

      respHeaders.set("Content-Type", contentType || "application/octet-stream");
      return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({ error: message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing 'url' in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsed = isSafeUrl(url);
    if (!parsed) {
      return new Response(
        JSON.stringify({ error: "Invalid URL protocol" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const upstream = await fetch(url, {
      headers: { "User-Agent": "IPTV-Desktop/1.0" },
      signal: AbortSignal.timeout(25000),
    });

    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
