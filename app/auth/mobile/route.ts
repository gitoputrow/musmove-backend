import { connection } from "next/server";

export async function GET() {
  await connection();
  // Deliberately no token/session exchange, automatic login, or arbitrary redirect.
  return new Response('<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MusMove</title></head><body><main><h1>MusMove</h1><p>Silakan kembali ke aplikasi dan masuk untuk melanjutkan.</p></main></body></html>', {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff", "x-frame-options": "DENY", "x-robots-tag": "noindex, nofollow",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" },
  });
}
