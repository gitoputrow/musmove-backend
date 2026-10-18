// Read-only public storefront extraction. Stdout contains food-price facts only;
// never evaluate page JavaScript, log its application state, or load local .env.
// Candidates still require review of food identity, edible weight and units.
import { z } from "zod";

async function main() {
const compact = process.argv.includes("--compact");
const roots = process.argv.slice(2).filter(value => value !== "--compact");
if (!roots.length) throw new Error("Pass one or more public Sayurbox category URLs; no automatic crawling");
const record = z.record(z.string(), z.unknown());
const candidates = new Map<string, object>();
const categories = new Map<string, object>();
for (const raw of roots) {
  const url = new URL(raw);
  if (url.origin !== "https://www.sayurbox.com" || !/^\/(?:product\/[a-z0-9-]+|category\/[a-z0-9-]+(?:\/sub-category\/[a-z0-9-]+)?)$/.test(url.pathname) || url.search) {
    throw new Error("Only explicit public category URLs on the pinned storefront are supported");
  }
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error("Public storefront unavailable");
  const html = await response.text();
  if (Buffer.byteLength(html) > 4_000_000) throw new Error("Unexpected public page size");
  const initial = html.match(/<script[^>]*data-name="ssr-initial"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!initial) throw new Error("Public storefront format changed");
  const prefix = "window.WWW_GRAPHQL_STATE =";
  const start = initial.indexOf(prefix), end = initial.indexOf("window.WWW_INITIAL_MUTABLE_STATE", start);
  if (start < 0 || end < start) throw new Error("Missing public product state");
  const state = record.parse(JSON.parse(initial.slice(start + prefix.length, end).trim().replace(/;$/, "")));
  for (const value of Object.values(state)) {
    const parsed = record.safeParse(value); if (!parsed.success) continue;
    const product = parsed.data;
    if (product.__typename === "Category" && typeof product.slug === "string") {
      categories.set(product.slug, { slug: product.slug, name: product.name ?? product.displayName });
    }
    if (product.__typename !== "Product" || typeof product.slug !== "string" || typeof product.displayName !== "string") continue;
    const connection = record.safeParse(product.productVariants); if (!connection.success) continue;
    const variants = connection.data.productVariant;
    if (!Array.isArray(variants)) continue;
    for (const ref of variants) {
      const pointer = record.safeParse(ref); if (!pointer.success || typeof pointer.data.__ref !== "string") continue;
      const item = record.safeParse(state[pointer.data.__ref]); if (!item.success) continue;
      const v = item.data;
      if (typeof v.variantName !== "string" || typeof v.skuCode !== "string") continue;
      // Exclude multipacks, count-only offers, mixed bundles, and unbound weights.
      const weight = v.variantName.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:-\s*(\d+(?:[.,]\d+)?))?\s*(kg|gram|gr|g|ml|mL|liter|litre|L)$/i);
      if (!weight) continue;
      const price = typeof v.actualPrice === "number" && v.actualPrice > 0 ? v.actualPrice : v.price;
      if (typeof price !== "number" || !Number.isSafeInteger(price) || price <= 0) continue;
      const unit = weight[3].toLowerCase(); const multiplier = ["kg", "l", "liter", "litre"].includes(unit) ? 1000 : 1;
      const low = Number(weight[1].replace(",", ".")) * multiplier, high = weight[2] ? Number(weight[2].replace(",", ".")) * multiplier : low;
      if (low <= 0 || high < low) continue;
      candidates.set(v.skuCode, {
        id: `sayurbox-${v.skuCode}`, productName: `${product.displayName.trim()} — ${v.variantName}`,
        sourceName: "Sayurbox", sourceUrl: `https://www.sayurbox.com/product/${product.slug}`,
        location: "Etalase publik default Sayurbox; lokasi pengiriman belum dipilih",
        checkedAt: new Date().toISOString().slice(0, 10), sourceDate: null, access: "live_page",
        priceRupiah: price, quantity: (low + high) / 2,
        unit: ["ml", "l", "liter", "litre"].includes(unit) ? "ml" : "g",
        note: `${v.actualPrice === price ? "Harga reguler" : "Harga tercantum"} pada varian, bukan harga termurah lintas varian; ongkir tidak termasuk.${low !== high ? ` Berat tertulis ${low}–${high}; titik tengah ${((low + high) / 2)} digunakan untuk estimasi, bukan berat terukur.` : ""}`,
      });
    }
  }
}
const values = [...candidates.values()] as { id: string; productName: string; sourceUrl: string; priceRupiah: number; quantity: number; unit: string; note: string }[];
console.info(JSON.stringify(compact ? {
  checkedAt: new Date().toISOString().slice(0, 10),
  quoteFields: ["id", "productName", "sourceUrl", "priceRupiah", "quantity", "unit", "note"],
  quotes: values.map(v => [v.id, v.productName, v.sourceUrl, v.priceRupiah, v.quantity, v.unit, v.note]),
} : { categories: [...categories.values()], candidates: values }, null, compact ? undefined : 2));
}
void main().catch(() => { console.error("Public food-price collection failed; no application state logged"); process.exitCode = 1; });
