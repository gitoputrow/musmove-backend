import { randomBytes } from "node:crypto";
import { connection } from "next/server";
import { apiJson, publicHandler, readJson } from "@/src/lib/http";
import { ApiError } from "@/src/lib/api-error";
import { consumeRateLimit, rateLimitIdentity } from "@/src/lib/security/rate-limit";
import { completePasswordReset, resetPasswordSchema } from "@/src/modules/accounts/password-reset";

export async function GET() {
  await connection();
  const nonce = randomBytes(24).toString("base64");
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Reset password MusMove</title>
<style nonce="${nonce}">body{font:16px system-ui;background:#10151d;color:#f3f6fa;margin:0;padding:32px}main{max-width:420px;margin:8vh auto}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{padding:12px;margin:8px 0 20px;border-radius:8px}button{background:#b5f36d;border:0;font-weight:700}p{line-height:1.6}button:disabled{opacity:.5}</style></head><body><main><h1>Password baru</h1><p>Gunakan password unik untuk akun MusMove. Jangan bagikan tautan reset ini.</p>
<form id="reset" method="post" action="/auth/reset-password"><label>Password baru<input id="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>Ulangi password<input id="confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><button id="submit" type="submit" disabled>Simpan password</button></form><p id="message" role="status" aria-live="polite"></p><noscript>Aktifkan JavaScript untuk menyelesaikan reset dengan aman.</noscript></main>
<script nonce="${nonce}">(()=>{const q=new URLSearchParams(location.search);let token=q.get('token');const invalid=q.has('error')||q.getAll('token').length!==1||!token||token.length>2048;history.replaceState(null,'','/auth/reset-password');const form=document.getElementById('reset'),button=document.getElementById('submit'),message=document.getElementById('message');if(invalid){message.textContent='Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru dari aplikasi.';form.hidden=true;return;}button.disabled=false;form.addEventListener('submit',async e=>{e.preventDefault();const password=document.getElementById('password').value;if(password!==document.getElementById('confirmation').value){message.textContent='Kedua password harus sama.';return;}button.disabled=true;try{const response=await fetch('/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',redirect:'error',body:JSON.stringify({token,newPassword:password})});if(response.ok){token=null;form.reset();form.hidden=true;message.textContent='Password diperbarui. Kembali ke aplikasi dan login dengan password baru.';}else{message.textContent=response.status===429?'Terlalu banyak percobaan. Tunggu sebelum mencoba lagi.':response.status===503?'Layanan sedang terganggu. Coba login sebelum mengulangi reset.':'Tautan tidak valid/kedaluwarsa atau password tidak memenuhi kebijakan. Minta tautan baru bila diperlukan.';}}catch{message.textContent='Koneksi terputus. Coba login dengan password baru sebelum mengulangi reset.';}finally{button.disabled=false;}});})();</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "x-robots-tag": "noindex, nofollow",
    "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'` } });
}

export const POST = publicHandler(async ({ request }) => {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "Reset must be submitted from this website");
  await consumeRateLimit("password-reset", rateLimitIdentity(request), 5, 600000);
  return apiJson(await completePasswordReset(resetPasswordSchema.parse(await readJson(request, 8192))));
});
