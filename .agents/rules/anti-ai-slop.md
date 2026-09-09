# Anti-AI-Slop Design Rules

> **MANDATORY DIRECTIVE FOR ALL AI AGENTS AND DEVELOPERS**  
> Sumber kebenaran visual aplikasi ini adalah **DESIGN.md** (Notion Style: *warm paper notebook under afternoon sun*).  
> Dilarang keras menerapkan pola desain generik, murahan, atau "AI Slop" yang biasa dihasilkan oleh generator template AI.

---

## 1. Dilarang Keras: Bayangan Tebal (No Heavy Shadows)
* **Larangan:**
  - JANGAN PERNAH memakai `box-shadow` tebal, `shadow-lg`, `shadow-xl`, `shadow-2xl`, atau drop-shadow pekat pada card, modal, popover, maupun gambar.
  - Jangan gunakan ilusi 3D digital melayang yang mencolok.
* **Aturan Sesuai DESIGN.md:**
  - Elevasi dan kedalaman diciptakan **murni melalui kontras tumpukan warna permukaan** (*surface stack*):
    - Level 0 (Kanvas Halaman): Paper (`#f6f5f4`)
    - Level 1 (Kartu / Container Utama): Pure White (`#ffffff`)
    - Level 2 (Sidebar): Sidebar (`#f2f1ef`)
  - Batas antar elemen dipertegas dengan garis halus (*hairline border*): `rgba(0, 0, 0, 0.08)` (Hairline) atau `rgba(0, 0, 0, 0.12)` (Hairline Strong), **BUKAN bayangan**.
  - **Pengecualian — shadow lembut HANYA diizinkan untuk:** composer (`0 4px 12px rgba(0,0,0,.07)`), dropdown/popover (`0 8px 24px rgba(0,0,0,.08)`), dan sidebar mobile overlay (`10px 0 30px rgba(0,0,0,.08)`). Card/dialog lain tanpa shadow (hanya hairline).

---

## 2. Dilarang Keras: Warna Neon & Gradien Norak (No Neon / Glowing UI)
* **Larangan:**
  - Dilarang memakai warna neon menyala (oranye menusuk, cyan neon, electric purple, magenta).
  - Dilarang membuat border bercahaya (*glowing borders* seperti `ring-2 ring-cyan-400 shadow-[0_0_20px_#...]`).
  - Dilarang memakai teks gradien pelangi (*gradient text* `bg-gradient-to-r ... text-transparent`).
* **Aturan Sesuai DESIGN.md:**
  - Palet warna terkunci pada nuansa cetak/editorial yang hangat dan natural:
    - **Primary Accent:** Notion Blue (`#0075de`) — satu-satunya warna tombol aksi terisi.
    - **Teks Utama:** Ink Black (`#000000`) dengan hierarki alpha (100/95/60/45/40%).
    - **Teks Sekunder:** Stone (`#757575`), Graphite (`#615d59`).
    - **Aksen card:** Marigold (`#ffb110`), Coral (`#f64932`), Sky Wash (`#62aef0`), Midnight (`#02093a`) — hanya sebagai background card aksen.

---

## 3. Dilarang Keras: "Pill-upon-Pill" Slop (No Cluttered Capsules)
* **Larangan:**
  - Jangan menumpuk pil di dalam pil secara berlebihan sehingga terlihat seperti antarmuka template murahan (kapsul kecil melayang di dalam kapsul besar dengan garis tegas bertubrukan).
  - Jangan membuat semua tombol berbentuk kapsul lonjong dengan border oranye/neon terang.
* **Aturan Sesuai DESIGN.md:**
  - Radius resmi: card `12px` (`rounded-lg` / `rounded-xl` untuk composer di mobile `16px`), button `8px` (`rounded-md`), pill `9999px` (`rounded-full`), composer `18px` (`rounded-xl`).
  - Elemen interaktif internal harus tertata rapi, bersih (*breathable*), menggunakan gaya *ghost button* dengan warna netral, menyatu elegan dengan container putih.

---

## 4. Dilarang Keras: Menggunakan Emoji di UI Chrome (No Emojis in UI)
* **Larangan:**
  - JANGAN gunakan emoji (seperti 🚀, 🧠, ⚡, 💎, 🤖, 💡, 🔥, ✨, 🎉, dll.) sebagai ikon tombol, badge model, menu header, atau judul card. Emoji di antarmuka sistem adalah ciri khas paling kentara dari template AI slop.
* **Aturan Sesuai DESIGN.md:**
  - Gunakan ikon SVG garis bersih dan minimalis (misalnya library **Lucide React**) dengan ketebalan garis seragam (*stroke-width: 1.5px - 2px*).
  - Warna ikon harus konsisten mengikuti palet: Ink Black (`#2c2e2a`) atau Stone Gray (`#80827f`).

---

## 5. Dilarang Keras: Dark Mode Generik, Glassmorphism, & Blind Theming (Contrast Slop)
* **Larangan:**
  - Jangan buat tema gelap (*dark mode*) bertabur kaca buram (*glassmorphism*, `backdrop-blur-md bg-black/60`).
  - Jangan ada pattern garis-garis kotak (*grid dots / grid lines cyberpunk*).
  - **Dilarang keras Blind Inversion / Asal Tempel `dark:`:** Dilarang menambahkan modifier `dark:...` secara serampangan atau menebak-nebak utility Tailwind per komponen tanpa sistem token yang utuh.
  - **Dilarang keras Camouflaged Text (Teks Menyatu dengan Background):** Sangat dilarang mengubah warna background elemen/tombol (misal `dark:bg-*`) tanpa secara eksplisit dan berpasangan mengubah warna teks di dalamnya (`dark:text-*`), atau sebaliknya. Teks tombol, badge, atau label tidak boleh pernah menyatu, pudar, atau tidak terbaca di atas background-nya (misal: tombol dengan teks yang warnanya hampir sama atau identik dengan background tombol).
  - **Dilarang Merusak Baseline Light Mode:** Saat diminta mengadaptasi tema atau dark mode, dilarang merusak kontras, hierarki warna, atau class styling light mode yang sudah rapi dan terbukti bagus.
* **Aturan & Disiplin Pasangan Token (Atomic Token Pairing):**
  - Tema default aplikasi adalah **Light Editorial** di kanvas paper hangat `#f6f5f4`: terasa seperti buku catatan kertas hangat di bawah sinar matahari sore yang lapang dan bersahabat.
  - **Atomic Foreground-Background Pairing:** Setiap deklarasi background warna (`bg-*` / `dark:bg-*`) WAJIB selalu berpasangan dengan warna teks (`text-*` / `dark:text-*`) dan border (`border-*` / `dark:border-*`) yang memiliki rasio kontras tinggi dan jelas (memenuhi standar WCAG AA minimal 4.5:1 untuk teks normal).
  - Jika mengimplementasikan dark mode atau variasi tema apa pun, gunakan semantic token berpasangan (seperti `--background` + `--foreground`, `--primary` + `--primary-foreground`), BUKAN hardcoded modifier sepihak yang menyebabkan teks hilang atau kontras anjlok.

---

## 6. Disiplin Tipografi (Typography)
* **Larangan:**
  - Jangan mencampur font serif atau font hiasan sembarangan.
* **Aturan Sesuai DESIGN.md:**
  - **Inter** untuk semua UI (label hingga display).
  - Serif editorial (stack `Georgia, "Times New Roman", serif` — stand-in Lyon Text) **HANYA** untuk welcome copy halaman `/` (hero sub-copy 18px Graphite). Jangan gunakan serif untuk label, navigasi, atau kontrol UI.

---

## 7. Dilarang Keras: Inkonsistensi Layout (No "Frankenstein" Page Layouts)
* **Larangan:**
  - JANGAN membuat tata letak halaman yang beda-beda atau berubah drastis antar rute (misal: halaman utama pakai floating pill nav, halaman chat tiba-tiba ganti sidebar ungu, halaman settings tiba-tiba jadi layout tab horizontal tanpa sidebar).
  - Dilarang membuat lebar container, margin, padding halaman, atau posisi navigasi yang melompat-lompat saat user berpindah halaman.
* **Aturan Shell Global (Unified App Shell):**
  Aplikasi Zona.ai HANYA memiliki **2 jenis Shell resmi** yang konsisten dan paten:
  1. **Public / Editorial Shell** (untuk Landing Page & Halaman Auth):
     - Kanvas penuh Cream Paper (`#f5f1e4`).
     - Floating Pill Navigation Bar (White `#ffffff`, radius 50px) mengambang di atas dengan margin lebar.
     - Konten terpusat dengan `max-width: 1200px` dan padding seragam.
  2. **Workspace / App Shell** (untuk Chat, Compare Mode, History, Settings, & Profile):
     - Menggunakan **satu kerangka global yang sama**:
       - **Sidebar Kiri (White L1 surface):** Lebar paten (misal `260px` - `280px`), selalu berada di posisi yang sama, memuat logo, tombol "New Chat", daftar percakapan, widget kredit, dan menu profil.
       - **Main Workspace (Cream Paper L0 canvas):** Area kerja di tengah yang memuat thread percakapan atau konfigurasi settings.
     - Halaman Settings atau Profile **TIDAK BOLEH** merusak layout ini; settings harus dibuka sebagai Modal/Dialog di atas shell atau sebagai panel dalam main workspace dengan sidebar yang tetap diam di tempatnya.

---

## Ringkasan Pemeriksaan Mandiri (Self-Check Sebelum Commit UI):
1. [ ] Apakah background halaman berwarna Paper (`#f6f5f4`) dan bukan putih polos / hitam?
2. [ ] Apakah tidak ada `box-shadow` tebal sama sekali di kartu / popover?
3. [ ] Apakah tidak ada warna neon menyala atau efek glowing?
4. [ ] Apakah semua tombol dan label bebas dari emoji norak?
5. [ ] Apakah semua ikon menggunakan SVG monokrom / Lucide yang rapi?
6. [ ] Apakah layout halaman konsisten dengan shell global dan tidak berubah-ubah strukturnya?
7. [ ] Apakah sudah sesuai dengan pedoman komponen di `DESIGN.md`?
8. [ ] Apakah shadow hanya muncul di composer / dropdown-popover / sidebar mobile overlay?
9. [ ] Apakah setiap elemen interaktif (tombol, input, badge) memiliki kontras teks dan background yang berpasangan jelas (tidak menyatu/kamuflase, baik di light mode maupun saat dark mode aktif)?
