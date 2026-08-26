# Aplikasi Penggajian (PWA)

Aplikasi web penggajian berbasis client-side (tanpa server/database) — semua data
tersimpan di **localStorage** browser perangkat masing-masing. Cocok untuk
dihosting gratis di **GitHub Pages**.

## Struktur file yang harus ada di root repository

```
index.html
manifest.json
service-worker.js
css/style.css
js/app.js
js/xlsx.full.min.js
icons/icon-192.png
icons/icon-512.png
```

`files.zip` berisi folder `css/`, `js/`, dan `icons/` — ekstrak isinya ke root
repository sehingga strukturnya sama seperti di atas (sejajar dengan
`index.html`).

## Cara Deploy ke GitHub Pages

1. Buat repository baru di GitHub (boleh publik atau privat + GitHub Pro/Team
   untuk privat).
2. Upload `index.html`, `manifest.json`, `service-worker.js` ke root repo.
3. Ekstrak `files.zip` lalu upload folder `css/`, `js/`, `icons/` ke root repo
   (bukan di dalam folder lain).
4. Buka **Settings → Pages**, pilih source **branch `main`, folder `/root`**,
   simpan.
5. Tunggu 1-2 menit, akses melalui URL yang diberikan GitHub
   (`https://<username>.github.io/<repo>/`).
6. Karena PWA, pengguna bisa "Add to Home Screen" / install seperti aplikasi
   native dan tetap bisa dibuka offline setelah kunjungan pertama.

## Fitur Utama

- **Personalia**: tambah/edit pegawai (nama, jabatan, tanggal bergabung, jatah
  sakit/cuti, total gaji — otomatis terbagi 80% gaji pokok, 10% transport,
  10% uang makan).
- **Import Excel Kehadiran**: unggah file `.xlsx` rekap kehadiran per pegawai.
  Aplikasi otomatis membaca sheet detail harian (atau sheet "Ringkasan
  Kehadiran" sebagai cadangan) dan menghitung: jam telat, lupa absen, hari
  mangkir, jam pulang lebih awal, ketidaksesuaian daily report, jumlah sakit,
  dan jumlah cuti pada periode tersebut.
- **Surat Sakit**: catat surat sakit dengan rentang tanggal — otomatis
  menambah "jumlah sakit terpakai" pegawai terkait.
- **Slip Gaji**: pilih pegawai + periode → data kehadiran otomatis dihitung
  menjadi potongan, lalu bisa ditambah komponen manual (THR, lembur, BPJS,
  kasbon, dll) → slip bisa dicetak/disimpan sebagai PDF via dialog cetak
  browser, lalu disimpan ke Riwayat.
- **Riwayat Slip**: rekap semua slip yang pernah dibuat; saat disimpan, data
  sakit/cuti terpakai otomatis menjadi *baseline* untuk periode berikutnya
  (tidak perlu impor ulang slip lama).
- **Pengaturan**: nama & alamat perusahaan (muncul di kop slip), jam kerja
  standar, toleransi keterlambatan, hari & jam kerja per bulan.
- **Ekspor/Impor Data**: tombol di sidebar untuk backup seluruh data ke file
  `.json` dan memuatnya kembali (berguna saat pindah perangkat/browser).

## Rumus Potongan (sesuai contoh slip)

- **Telat**: toleransi 15 menit dari jam masuk standar; setiap kelebihan
  dibulatkan ke atas per jam × (gaji pokok ÷ 26 ÷ 8).
- **Lupa Absen** (masuk atau keluar): masing-masing dihitung 4 jam ×
  (gaji pokok ÷ 26 ÷ 8).
- **Mangkir**: (gaji pokok ÷ 26) × (2 × jumlah hari mangkir).
- **Tidak Daily Report**: 4 jam × (gaji pokok ÷ 26 ÷ 8) per kejadian.
- **Pulang Lebih Awal**: selisih jam dari jam pulang standar (dibulatkan ke
  atas) × (gaji pokok ÷ 26 ÷ 8).

Semua parameter (jam masuk/pulang standar, toleransi, hari & jam kerja per
bulan) bisa diubah di halaman **Pengaturan**.

## Catatan

- Data hanya tersimpan di browser/perangkat yang digunakan (localStorage).
  Gunakan fitur **Ekspor Data** secara berkala sebagai cadangan, terutama
  sebelum membersihkan cache browser atau berganti perangkat.
- Karena ini aplikasi statis, tidak ada login/otorisasi bawaan. Jika akan
  digunakan oleh banyak orang dengan data sensitif, pertimbangkan membuat
  repository **privat** dan mengaktifkan GitHub Pages khusus untuk paket
  berbayar, atau tambahkan proteksi akses tambahan sesuai kebutuhan.
