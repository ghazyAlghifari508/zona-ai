# P8 Component Discovery — Chat History Vertical Ellipsis

Ditulis sebelum implementasi. Fokus P8 hanya mengganti ikon aksi riwayat chat dari ellipsis horizontal ke vertikal dan menjaga perilaku menu yang sudah ada. Tidak ada browser QA, Playwright, atau visual review di fase ini.

## Kebutuhan

| Surface | Kebutuhan | Batas |
| --- | --- | --- |
| Sidebar — history item | Tombol aksi tiga titik vertikal (`⋮`) pada trigger `DropdownMenu` yang sama | Hanya item riwayat; jangan ubah ellipsis pagination atau komponen lain |
| Trigger | Tetap terlihat saat hover, fokus keyboard, menu terbuka, dan perangkat tanpa hover | Tanpa layout shift, padding baru, atau pemotongan judul yang makin parah |
| Menu | Rename dan delete confirmation tetap memakai `conversation.id` yang benar | Tidak mengubah route, DTO, state, atau copy |
| A11y | `aria-label` existing, fokus kembali, navigasi keyboard, ikon tersembunyi dari screen reader | Tidak menambah teks literal sebagai ganti ikon |

## Inventori lokal dan bukti terpasang

- `src/components/layout/Sidebar.tsx` — memakai `MoreHorizontalIcon` di import dan satu trigger history (`size={16}`, `strokeWidth={1.75}`, `aria-hidden="true"`). Menu memakai `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem` dari `src/components/ui/dropdown-menu.tsx`.
- `src/components/ui/dropdown-menu.tsx` — shadcn/Radix wrapper yang sudah ada; `DropdownMenuPrimitive.Trigger`, `Content`, `Item` dipakai langsung. Tidak perlu salin ulang primitive.
- `src/components/ui/button.tsx` — tersedia, tetapi trigger history sengaja berupa tombol native ber-`aria-label` agar tidak menambah padding/var visual.
- `src/styles/app.css` — token semantik `paper`, `pure-white`, `ink`, `stone`, `hairline`, `accent`; trigger memakai `text-stone`, `hover:text-ink`, jadi tidak ada warna literal baru.
- `package.json` — React 19.2.8, `@radix-ui/react-dropdown-menu` 2.1.24, `@hugeicons/core-free-icons` 4.3.0, `@hugeicons/react` 1.1.10, Tailwind CSS 4.1.13, `@tailwindcss/vite` 4.1.13.
- Ekspor terpasang diverifikasi dari `node_modules/@hugeicons/core-free-icons/dist/types/index.d.ts` dan runtime Bun: `MoreVerticalIcon` tersedia; `MoreVerticalCircleIcon`, `MoreVerticalSquareIcon`, dan varian `01/02` juga tersedia tetapi membawa dekorasi circle/square yang tidak diminta.
- `rg -n "MoreHorizontalIcon" src` — selain `Sidebar.tsx`, ikon horizontal juga dipakai `src/components/ui/pagination.tsx`. Pemakaian pagination sengaja tidak disentuh; hanya import di `Sidebar.tsx` yang diganti.

## Kandidat eksternal yang diperiksa

| Kandidat | Sumber | Cocok | Keputusan |
| --- | --- | --- | --- |
| shadcn/ui Dropdown Menu (Radix) | `https://ui.shadcn.com/docs/components/radix/dropdown-menu` | Ya: komposisi `Trigger`/`Content`/`Item`, `asChild`, already-local wrapper | **Dipakai kembali**; tidak install atau regenerate |
| Radix Dropdown Menu | `https://www.radix-ui.com/primitives/docs/components/dropdown-menu` | Ya: dokumentasi `data-state="open"` pada trigger, focus management penuh, keyboard navigation, return focus | **Dipakai sebagai dokumentasi kontrak**; tidak menambah dependency |
| Hugeicons React + core-free-icons | `https://hugeicons.com/` dan `https://github.com/hugeicons/hugeicons-react`; Context7 `/hugeicons/hugeicons-react`; `node_modules/@hugeicons/core-free-icons/dist/types/index.d.ts` | Ya: `HugeiconsIcon` merender ikon dari paket dengan `size`, `strokeWidth`, dan props `aria-*` | **Dipilih**: `MoreVerticalIcon` dari paket terpasang |
| Tailwind CSS v4 variants | `https://tailwindcss.com/docs/hover-focus-and-other-states`; Context7 `/tailwindlabs/tailwindcss.com` | Ya: `data-[state=open]:` untuk state Radix dan `not-hover:` yang menghasilkan `@media not (hover: hover)` | **Dipakai** untuk visibility, tanpa config baru |
| lucide-react `MoreVertical` | `https://lucide.dev/icons/ellipsis-vertical` | Fungsional, tetapi mencampur sistem ikon kedua untuk satu ikon | **Ditolak**: Hugeicons sudah dipakai dan ekspor vertikalnya tersedia |
| HeroUI Dropdown/Menu | `https://www.heroui.com/docs/react/components/dropdown` | Fungsional, tetapi React Aria + design system sendiri | **Ditolak**: library/design system paralel |
| Magic UI, React Bits, Thinking Orbs, Affect UI, Tuff UI, CUI, Sakani UI | `https://magicui.design/`, `https://reactbits.dev/`, `https://www.thinkingorbs.com/#orbs`, `https://www.affectui.com/components`, `https://tuffui.com/`, `https://yappologistic.github.io/CUI/`, `https://www.sakaniui.com/` | Berfokus pada animasi, dekorasi, dan blok landing; tidak menyediakan trigger ellipsis yang lebih cocok daripada menu existing | **Ditolak**: tidak relevan dan akan menambah dependency tanpa manfaat |
| Custom SVG / CSS rotate | Tidak ada | Bisa dibuat, tetapi prompt melarang literal character dan minta pakai ekspor nyata | **Ditolak**: tidak perlu primitive baru |

Tidak ada installer remote yang dijalankan. Tidak ada library baru yang ditambahkan.

## Kompatibilitas, lisensi, aksesibilitas, dependency

- **Dependency baru**: tidak ada. Perubahan memakai paket yang sudah tercantum di `package.json`.
- **Lisensi**: `@hugeicons/core-free-icons` 4.3.0 (MIT, sesuai metadata paket), `@hugeicons/react` 1.1.10 (MIT), `@radix-ui/react-dropdown-menu` 2.1.24 (MIT), kode shadcn/ui berada di bawah MIT. Tidak ada source baru yang disalin.
- **React/Radix**: komposisi existing tetap `DropdownMenuPrimitive.Trigger` dengan `asChild`; Radix mengelola keyboard, focus, dan `data-state`. `MoreVerticalIcon` adalah data ikon statis, bukan komponen interaktif.
- **Tailwind v4**: `not-hover:opacity-100` dan `data-[state=open]:opacity-100` memakai variant bawaan v4. `hover:` di v4 sudah dibatasi ke perangkat yang mendukung hover; `not-hover:` menutup kasus `(hover: none)`.
- **A11y**: `aria-label={`Menu ${conversation.title ?? 'New Chat'}`}` dipertahankan, `HugeiconsIcon` tetap `aria-hidden="true"`, fokus keyboard memakai `focus:opacity-100`, menu terbuka memakai `data-[state=open]:opacity-100`, dan perangkat tanpa hover memakai `not-hover:opacity-100`.
- **Light/dark**: hanya token existing `text-stone`/`hover:text-ink`; tidak ada warna literal, gradient, glow, atau badge baru.
- **Responsive**: ukuran ikon tetap 16px, padding tombol tetap `p-1.5`, margin tetap `mr-1`; tidak ada perubahan lebar trigger.

## Komponen yang benar-benar dipakai

| File | Peran |
| --- | --- |
| `src/components/layout/Sidebar.tsx` | Satu-satunya file UI yang diubah: import `MoreVerticalIcon` dan trigger history |
| `src/components/ui/dropdown-menu.tsx` | Primitive shadcn/Radix existing, tidak diubah |
| `node_modules/@hugeicons/core-free-icons` | Ekspor `MoreVerticalIcon` yang diverifikasi terpasang |
| `node_modules/@hugeicons/react` | Renderer `HugeiconsIcon` existing |
| `src/styles/app.css` | Token semantik existing (tidak diubah) |

`MoreHorizontalIcon` di `src/components/ui/pagination.tsx` sengaja tetap dipakai untuk ellipsis pagination. Tidak ada komponen HeroUI, Magic UI, React Bits, Thinking Orbs, Affect UI, Tuff UI, CUI, Sakani, atau lucide yang dipasang/diimpor.
