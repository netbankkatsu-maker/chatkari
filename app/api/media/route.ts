const ALLOWED = /(\.r2\.dev$|modelslab\.com$|\.modelslab\.com$|stablediffusionapi\.com$|\.x\.ai$|^x\.ai$)/i;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url") || "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("invalid url", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED.test(target.hostname)) {
    return new Response("blocked", { status: 400 });
  }
  const upstream = await fetch(target.href, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
    cache: "no-store",
  }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return new Response("missing", { status: 502 });
  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return new Response("not image", { status: 502 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
