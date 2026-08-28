# Anti-AI-Slop Design Rules

> **MANDATORY DIRECTIVE FOR ALL AI AGENTS AND DEVELOPERS**  
> Sumber kebenaran visual aplikasi ini adalah **DESIGN.md** (MindMarket Style: *Warm storybook on cream paper*).  
> Dilarang keras menerapkan pola desain generik, murahan, atau "AI Slop" yang biasa dihasilkan oleh generator template AI.

---

## 1. Dilarang Keras: Bayangan Tebal (No Heavy Shadows)
* **Larangan:**
  - JANGAN PERNAH memakai `box-shadow` tebal, `shadow-lg`, `shadow-xl`, `shadow-2xl`, atau drop-shadow pekat pada card, modal, popover, maupun gambar.
  - Jangan gunakan ilusi 3D digital melayang yang mencolok.
* **Aturan Sesuai DESIGN.md:**
  - Elevasi dan kedalaman diciptakan **murni melalui kontras tumpukan warna permukaan** (*surface stack*):
    - Level 0 (Kanvas Halaman): Cream Paper (`#f5f1e4`)
    - Level 1 (Kartu / Container Utama): Pure White (`#ffffff`)
    - Level 2 (Area Inset / Recessed): Sandstone (`#e0dbce`)
  - Batas antar elemen dipertegas dengan garis halus (*hairline border*): `#d5d5d4` (Hairline Mist) atau `#2c2e2a` (Ink Black 1px), **BUKAN bayangan**.

---

## 2. Dilarang Keras: Warna Neon & Gradien Norak (No Neon / Glowing UI)
* **Larangan:**
  - Dilarang memakai warna neon menyala (oranye menusuk, cyan neon, electric purple, magenta).
  - Dilarang membuat border bercahaya (*glowing borders* seperti `ring-2 ring-cyan-400 shadow-[0_0_20px_#...]`).
  - Dilarang memakai teks gradien pelangi (*gradient text* `bg-gradient-to-r ... text-transparent`).
* **Aturan Sesuai DESIGN.md:**
  - Palet warna terkunci pada nuansa cetak/editorial yang hangat dan natural:
    - **Primary Accent:** Fresh Grass (`#8ed462`) — hanya untuk aksen struktural (stroke border, nav indicator, tombol submit subtil).
    - **Teks Utama:** Ink Black (`#2c2e2a`) — bukan pure `#000000` pekat agar tetap ramah di atas kanvas cream.
    - **Teks Sekunder:** Stone Gray (`#80827f`).
    - **Warna Aksen Tambahan:** Sky Pop (`#2ba0ff`), Coral Pop (`#ff705d`), Sunshine Pop (`#f5e211`) — hanya dipakai sangat hemat sebagai penanda titik kecil atau aksen garis, BUKAN untuk blok warna neon besar.

---

## 3. Dilarang Keras: "Pill-upon-Pill" Slop (No Cluttered Capsules)
* **Larangan:**
  - Jangan menumpuk pil di dalam pil secara berlebihan sehingga terlihat seperti antarmuka template murahan (kapsul kecil melayang di dalam kapsul besar dengan garis tegas bertubrukan).
  - Jangan membuat semua tombol berbentuk kapsul lonjong dengan border oranye/neon terang.
* **Aturan Sesuai DESIGN.md:**
  - Radius 50px (*sticker-soft*) diperuntukkan bagi kontainer besar utama (seperti Floating Navigation atau Container Baris Input).
  - Elemen interaktif internal di dalamnya harus tertata rapi, bersih (*breathable*), menggunakan gaya *ghost button* atau micro-radius halus (10px) dengan warna netral, menyatu elegan dengan container putih.

---

## 4. Dilarang Keras: Menggunakan Emoji di UI Chrome (No Emojis in UI)
* **Larangan:**
  - JANGAN gunakan emoji (seperti 🚀, 🧠, ⚡, 💎, 🤖, 💡, 🔥, ✨, 🎉, dll.) sebagai ikon tombol, badge model, menu header, atau judul card. Emoji di antarmuka sistem adalah ciri khas paling kentara dari template AI slop.
* **Aturan Sesuai DESIGN.md:**
  - Gunakan ikon SVG garis bersih dan minimalis (misalnya library **Lucide React**) dengan ketebalan garis seragam (*stroke-width: 1.5px - 2px*).
  - Warna ikon harus konsisten mengikuti palet: Ink Black (`#2c2e2a`) atau Stone Gray (`#80827f`).

---

## 5. Dilarang Keras: Dark Mode Generik / Glassmorphism
* **Larangan:**
  - Jangan buat tema gelap (*dark mode*) bertabur kaca buram (*glassmorphism*, `backdrop-blur-md bg-black/60`).
  - Jangan ada pattern garis-garis kotak (*grid dots / grid lines cyberpunk*).
* **Aturan Sesuai DESIGN.md:**
  - Tema aplikasi adalah **Light Editorial**: terasa seperti buku ilustrasi cerita di atas kertas cream berkualitas tinggi yang lapang dan bersahabat.

---

## 6. Disiplin Tipografi (Typography)
* **Larangan:**
  - Jangan mencampur font serif atau font hiasan sembarangan.
* **Aturan Sesuai DESIGN.md:**
  - Font keluarga tunggal: **Inter** untuk semua kebutuhan (mulai dari label 9px hingga display 144px).
  - Display headline menggunakan tracking rapat (`letter-spacing: -0.06em`) dan line-height padat (`0.95`).

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
1. [ ] Apakah background halaman berwarna Cream Paper (`#f5f1e4`) dan bukan putih polos / hitam?
2. [ ] Apakah tidak ada `box-shadow` tebal sama sekali di kartu / popover?
3. [ ] Apakah tidak ada warna neon menyala atau efek glowing?
4. [ ] Apakah semua tombol dan label bebas dari emoji norak?
5. [ ] Apakah semua ikon menggunakan SVG monokrom / Lucide yang rapi?
6. [ ] Apakah layout halaman konsisten dengan shell global dan tidak berubah-ubah strukturnya?
7. [ ] Apakah sudah sesuai dengan pedoman komponen di `DESIGN.md`?
