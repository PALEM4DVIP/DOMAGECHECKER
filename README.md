# Domain Inspector

Tools untuk memeriksa **umur domain (WHOIS/RDAP)**, **catatan DNS**, dan **sertifikat SSL** — satu domain atau banyak domain sekaligus (bulk check, maks. 50 per permintaan).

## Fitur
- **Umur domain**: tanggal registrasi, tanggal kadaluarsa, umur (tahun/bulan/hari), registrar — via RDAP publik (tanpa API key).
- **DNS records**: A, AAAA, MX, NS, TXT, CNAME — via Google DNS-over-HTTPS.
- **SSL certificate**: penerbit, masa berlaku, sisa hari, status kepercayaan — dengan koneksi TLS langsung ke port 443.
- **Bulk check**: tempel banyak domain sekaligus (satu per baris atau dipisah koma), diproses paralel dengan batas concurrency.
- **Ekspor CSV** dari hasil pemeriksaan.

## Struktur proyek
```
app/
  api/check/route.js   # API endpoint (Node.js runtime) — WHOIS/RDAP + DNS + SSL
  page.js               # UI utama
  layout.js, globals.css
```

## Menjalankan secara lokal
```bash
npm install
npm run dev
```
Buka http://localhost:3000

## Deploy ke Vercel

**Cara termudah (tanpa CLI):**
1. Push folder ini ke repo GitHub baru.
2. Buka https://vercel.com/new, import repo tersebut.
3. Framework preset otomatis terdeteksi sebagai **Next.js** — tidak perlu ubah apa pun.
4. Klik **Deploy**. Tidak ada environment variable yang dibutuhkan.

**Via Vercel CLI:**
```bash
npm install -g vercel
vercel login
vercel        # deploy preview
vercel --prod # deploy production
```

## Catatan teknis & batasan
- Endpoint `/api/check` berjalan di **Node.js runtime** (bukan Edge) karena pemeriksaan SSL memakai modul `tls` bawaan Node untuk membuka koneksi mentah ke port 443 — ini tidak bisa dilakukan di Edge runtime.
- Cakupan RDAP bergantung pada registry masing-masing TLD. Sebagian besar TLD umum (.com, .net, .org, .id, .io, dll.) didukung lewat `rdap.org` sebagai router otomatis; sebagian TLD kecil mungkin tidak memiliki server RDAP publik.
- Domain yang diblokir firewall/WAF atau tidak merespons di port 443 akan muncul sebagai "tidak dapat memeriksa SSL", bukan error aplikasi.
- Di paket **Vercel Hobby**, durasi maksimum serverless function adalah 60 detik (sudah diset via `maxDuration`). Untuk bulk check dalam jumlah besar (mendekati 50 domain sekaligus) pada paket gratis, pertimbangkan menaikkan concurrency batch atau memecah menjadi beberapa permintaan jika mengalami timeout.
- Tidak ada API key/token pihak ketiga yang diperlukan — semua sumber data (RDAP, Google DoH, TLS langsung) bersifat publik dan gratis.

## Menyesuaikan
- Ubah batas jumlah domain per permintaan: `MAX_DOMAINS` di `app/api/check/route.js`.
- Ubah jumlah domain diproses paralel: `CONCURRENCY` di file yang sama.
- Warna, tipografi, dan tema visual: `tailwind.config.js` dan `app/globals.css`.


Support bye : https://kulinerfourd.xyz/