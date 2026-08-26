/* =========================================================
   APLIKASI PENGGAJIAN - app.js
   Semua data disimpan di localStorage (offline-first, PWA)
   ========================================================= */

const STORAGE_KEY = "payrollAppData_v1";

const DEFAULT_CONFIG = {
  namaPerusahaan: "PT. Kamil Group Indonesia",
  alamat1: "Kavling DPRD II, Jl Monginsidi No. 16",
  alamat2: "Sidoklumpuk, Bluru Kidul, Kec. Sidoarjo",
  alamat3: "Kab. Sidoarjo, Jawa Timur, 61218",
  jamMasuk: "08:00",
  jamPulang: "16:00",
  toleransiMenit: 15,
  hariKerjaPerBulan: 26,
  jamKerjaPerHari: 8
};

let DB = loadDB();

function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.config = Object.assign({}, DEFAULT_CONFIG, parsed.config || {});
      parsed.personalia = parsed.personalia || [];
      parsed.suratSakit = parsed.suratSakit || [];
      parsed.riwayatSlip = parsed.riwayatSlip || [];
      parsed.kehadiranImport = parsed.kehadiranImport || {}; // key: personaliaId -> {periode data}
      return parsed;
    }
  } catch (e) { console.warn("Gagal memuat data lokal", e); }
  return { config: { ...DEFAULT_CONFIG }, personalia: [], suratSakit: [], riwayatSlip: [], kehadiranImport: {} };
}

function saveDB() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatRupiah(n) {
  n = Number(n) || 0;
  return "Rp " + n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDateFlexible(str) {
  // Menangani format seperti "26 Jul 2026" (bahasa Indonesia singkat) dan format ISO
  if (!str) return null;
  if (str instanceof Date) return str;
  const bulanMap = { jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, may: 4, jun: 5, jul: 6, agu: 7, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, des: 11, dec: 11 };
  const s = String(str).trim();
  // ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s);
  const m = s.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = bulanMap[m[2].toLowerCase().slice(0, 3)];
    const year = parseInt(m[3], 10);
    if (mon !== undefined) return new Date(year, mon, day);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function isoDate(d) {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function timeToMinutes(t) {
  if (!t || t === "-" || typeof t !== "string") return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function diffMasaKerja(tglBergabung, tglAcuan) {
  const a = parseDateFlexible(tglBergabung);
  const b = tglAcuan ? parseDateFlexible(tglAcuan) : new Date();
  if (!a || !b) return { tahun: 0, bulan: 0, totalBulan: 0, label: "-" };
  let totalBulan = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) totalBulan -= 1;
  if (totalBulan < 0) totalBulan = 0;
  const tahun = Math.floor(totalBulan / 12);
  if (totalBulan >= 12) {
    const tahunDesimal = Math.round((totalBulan / 12) * 10) / 10;
    return { tahun, bulan: totalBulan % 12, totalBulan, label: `${tahunDesimal} Tahun`, tahunDesimal };
  }
  return { tahun: 0, bulan: totalBulan, totalBulan, label: `${totalBulan} Bulan`, tahunDesimal: totalBulan / 12 };
}

/* ---------------------------------------------------------
   PERSONALIA
--------------------------------------------------------- */
function hitungSplitGaji(total) {
  total = Number(total) || 0;
  const pokok = round2(total * 0.8);
  const transport = round2(total * 0.1);
  const makan = round2(total * 0.1);
  return { pokok, transport, makan };
}
function round2(n) { return Math.round(n * 100) / 100; }

function getPersonaliaById(id) {
  return DB.personalia.find(p => p.id === id);
}

function renderPersonaliaTable() {
  const tbody = document.querySelector("#tblPersonalia tbody");
  tbody.innerHTML = "";
  DB.personalia.forEach(p => {
    const masa = diffMasaKerja(p.tglBergabung);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.nama)}</td>
      <td>${escapeHtml(p.jabatan)}</td>
      <td>${p.tglBergabung ? formatTglIndo(p.tglBergabung) : "-"}</td>
      <td>${masa.label}</td>
      <td>${p.sakitTerpakai} / ${p.jatahSakit}</td>
      <td>${p.cutiTerpakai} / ${p.jatahCuti}</td>
      <td>${formatRupiah(p.totalGaji)}</td>
      <td>
        <button class="btn-icon" data-action="edit-personalia" data-id="${p.id}">Edit</button>
        <button class="btn-danger" data-action="hapus-personalia" data-id="${p.id}">Hapus</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function formatTglIndo(iso) {
  const d = parseDateFlexible(iso);
  if (!d) return iso;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function openModalPersonalia(id) {
  const modal = document.getElementById("modalPersonalia");
  modal.dataset.editId = id || "";
  document.getElementById("modalPersonaliaTitle").textContent = id ? "Edit Personalia" : "Tambah Personalia";
  if (id) {
    const p = getPersonaliaById(id);
    document.getElementById("fNama").value = p.nama;
    document.getElementById("fJabatan").value = p.jabatan;
    document.getElementById("fTglBergabung").value = p.tglBergabung || "";
    document.getElementById("fJatahSakit").value = p.jatahSakit;
    document.getElementById("fSakitTerpakai").value = p.sakitTerpakai;
    document.getElementById("fJatahCuti").value = p.jatahCuti;
    document.getElementById("fCutiTerpakai").value = p.cutiTerpakai;
    document.getElementById("fVisitInOut").value = p.visitInOut;
    document.getElementById("fTotalGaji").value = p.totalGaji;
  } else {
    ["fNama", "fJabatan", "fTglBergabung"].forEach(id2 => document.getElementById(id2).value = "");
    document.getElementById("fJatahSakit").value = 12;
    document.getElementById("fSakitTerpakai").value = 0;
    document.getElementById("fJatahCuti").value = 6;
    document.getElementById("fCutiTerpakai").value = 0;
    document.getElementById("fVisitInOut").value = 0;
    document.getElementById("fTotalGaji").value = 0;
  }
  updateSplitPreview();
  modal.classList.add("active");
}

function updateSplitPreview() {
  const total = Number(document.getElementById("fTotalGaji").value) || 0;
  const { pokok, transport, makan } = hitungSplitGaji(total);
  document.getElementById("splitPreview").innerHTML =
    `Gaji Pokok (80%): <b>${formatRupiah(pokok)}</b> &nbsp;|&nbsp;
     Tunjangan Transport (10%): <b>${formatRupiah(transport)}</b> &nbsp;|&nbsp;
     Tunjangan Makan (10%): <b>${formatRupiah(makan)}</b>`;
}

function closeModalPersonalia() {
  document.getElementById("modalPersonalia").classList.remove("active");
}

function simpanPersonalia() {
  const id = document.getElementById("modalPersonalia").dataset.editId;
  const nama = document.getElementById("fNama").value.trim();
  if (!nama) { alert("Nama wajib diisi"); return; }
  const total = Number(document.getElementById("fTotalGaji").value) || 0;
  const split = hitungSplitGaji(total);
  const data = {
    id: id || uid(),
    nama,
    jabatan: document.getElementById("fJabatan").value.trim(),
    tglBergabung: document.getElementById("fTglBergabung").value,
    jatahSakit: Number(document.getElementById("fJatahSakit").value) || 0,
    sakitTerpakai: Number(document.getElementById("fSakitTerpakai").value) || 0,
    jatahCuti: Number(document.getElementById("fJatahCuti").value) || 0,
    cutiTerpakai: Number(document.getElementById("fCutiTerpakai").value) || 0,
    visitInOut: Number(document.getElementById("fVisitInOut").value) || 0,
    totalGaji: total,
    gajiPokok: split.pokok,
    tunjTransport: split.transport,
    tunjMakan: split.makan
  };
  if (id) {
    const idx = DB.personalia.findIndex(p => p.id === id);
    DB.personalia[idx] = data;
  } else {
    DB.personalia.push(data);
  }
  saveDB();
  renderPersonaliaTable();
  populateAllPersonaliaSelects();
  renderDashboard();
  closeModalPersonalia();
}

function hapusPersonalia(id) {
  if (!confirm("Hapus data personalia ini? Data terkait (kehadiran/sakit/slip) tidak akan otomatis terhapus.")) return;
  DB.personalia = DB.personalia.filter(p => p.id !== id);
  saveDB();
  renderPersonaliaTable();
  populateAllPersonaliaSelects();
  renderDashboard();
}

function populateAllPersonaliaSelects() {
  const selects = ["selKehadiranPegawai", "selSlipPegawai", "fSakitPegawai"];
  selects.forEach(selId => {
    const sel = document.getElementById(selId);
    const current = sel.value;
    sel.innerHTML = DB.personalia.map(p => `<option value="${p.id}">${escapeHtml(p.nama)} - ${escapeHtml(p.jabatan)}</option>`).join("");
    if (current) sel.value = current;
  });
}

/* ---------------------------------------------------------
   SURAT SAKIT
--------------------------------------------------------- */
function renderSakitTable() {
  const tbody = document.querySelector("#tblSakit tbody");
  tbody.innerHTML = "";
  DB.suratSakit.slice().reverse().forEach(s => {
    const p = getPersonaliaById(s.personaliaId);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p ? escapeHtml(p.nama) : "(dihapus)"}</td>
      <td>${formatTglIndo(s.tglMulai)}</td>
      <td>${formatTglIndo(s.tglSelesai)}</td>
      <td>${s.jumlahHari}</td>
      <td>${escapeHtml(s.keterangan || "-")}</td>
      <td><button class="btn-danger" data-action="hapus-sakit" data-id="${s.id}">Hapus</button></td>`;
    tbody.appendChild(tr);
  });
}

function hitungJumlahHari(mulai, selesai) {
  const a = parseDateFlexible(mulai), b = parseDateFlexible(selesai);
  if (!a || !b) return 0;
  const diff = Math.round((b - a) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

function simpanSuratSakit() {
  const personaliaId = document.getElementById("fSakitPegawai").value;
  const tglMulai = document.getElementById("fSakitMulai").value;
  const tglSelesai = document.getElementById("fSakitSelesai").value;
  if (!personaliaId || !tglMulai || !tglSelesai) { alert("Lengkapi semua data"); return; }
  const jumlahHari = hitungJumlahHari(tglMulai, tglSelesai);
  const data = {
    id: uid(),
    personaliaId,
    tglMulai,
    tglSelesai,
    jumlahHari,
    keterangan: document.getElementById("fSakitKeterangan").value.trim()
  };
  DB.suratSakit.push(data);
  // otomatis tambah ke sakit terpakai personalia
  const p = getPersonaliaById(personaliaId);
  if (p) {
    p.sakitTerpakai = (Number(p.sakitTerpakai) || 0) + jumlahHari;
    saveDB();
    renderPersonaliaTable();
  }
  saveDB();
  renderSakitTable();
  document.getElementById("modalSakit").classList.remove("active");
}

function hapusSuratSakit(id) {
  const s = DB.suratSakit.find(x => x.id === id);
  if (!s) return;
  if (!confirm("Hapus surat sakit ini? Jumlah sakit terpakai pegawai akan dikurangi kembali.")) return;
  const p = getPersonaliaById(s.personaliaId);
  if (p) {
    p.sakitTerpakai = Math.max(0, (Number(p.sakitTerpakai) || 0) - s.jumlahHari);
  }
  DB.suratSakit = DB.suratSakit.filter(x => x.id !== id);
  saveDB();
  renderSakitTable();
  renderPersonaliaTable();
}

/* ---------------------------------------------------------
   IMPORT EXCEL KEHADIRAN
   Mendukung 2 bentuk sheet:
   1. Sheet detail harian (nama sheet = nama pegawai) dengan kolom:
      No, Tanggal, Status, Keterangan, Daily Report, Pola Kerja(2col),
      Kehadiran Harian (Jam Masuk, Istirahat, Selesai Istirahat, Jam Keluar,
      Lembur Masuk, Lembur Keluar), Total(Kehadiran, Istirahat, Lembur), Timezone
   2. Sheet "Ringkasan Kehadiran" agregat per pegawai (fallback jika sheet
      detail tidak ditemukan)
--------------------------------------------------------- */

function prosesFileKehadiran(file, personaliaId, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, { type: "array" });
    const p = getPersonaliaById(personaliaId);
    let hasil = null;

    // Coba cari sheet detail dengan nama sama seperti pegawai
    const sheetNames = wb.SheetNames;
    let detailSheetName = sheetNames.find(n => p && n.trim().toLowerCase() === p.nama.trim().toLowerCase());
    if (!detailSheetName) {
      // ambil sheet kedua kalau ada (selain Ringkasan) sebagai fallback
      detailSheetName = sheetNames.find(n => !/ringkasan/i.test(n));
    }

    if (detailSheetName) {
      const ws = wb.Sheets[detailSheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
      hasil = parseSheetDetailHarian(rows);
    }

    if (!hasil) {
      const ringkasanName = sheetNames.find(n => /ringkasan/i.test(n));
      if (ringkasanName) {
        const ws = wb.Sheets[ringkasanName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
        hasil = parseSheetRingkasan(rows, p ? p.nama : null);
      }
    }

    callback(hasil);
  };
  reader.readAsArrayBuffer(file);
}

function parseSheetDetailHarian(rows) {
  // cari baris header yang mengandung 'Tanggal' dan 'Status'
  let headerRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.some(c => String(c).trim() === "Tanggal") && row.some(c => String(c).trim() === "Status")) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) return null;

  // temukan indeks kolom-kolom penting dengan menelusuri 2 baris header (bisa merge)
  const headerRow1 = rows[headerRowIdx] || [];
  const headerRow2 = rows[headerRowIdx + 1] || [];
  const idxOf = (label, row) => row.findIndex(c => c && String(c).trim() === label);

  const col = {
    tanggal: idxOf("Tanggal", headerRow1),
    status: idxOf("Status", headerRow1),
    keterangan: idxOf("Keterangan", headerRow1),
    dailyReport: idxOf("Daily Report", headerRow1),
  };
  // Jam Masuk/Keluar AKTUAL berada di grup "Kehadiran Harian" (headerRow1), bukan
  // grup "Pola Kerja" yang juga punya label "Jam Masuk"/"Jam Keluar". Cari batas
  // grup "Kehadiran Harian" dulu di headerRow1, baru cari label di headerRow2
  // pada atau setelah kolom tersebut.
  const idxKehadiranHarian = idxOf("Kehadiran Harian", headerRow1);
  const searchFrom = idxKehadiranHarian > -1 ? idxKehadiranHarian : (col.dailyReport > -1 ? col.dailyReport + 1 : 0);

  let idxJamMasuk = -1, idxJamKeluar = -1, idxTotalKehadiran = -1;
  for (let i = searchFrom; i < headerRow2.length; i++) {
    const val = headerRow2[i] ? String(headerRow2[i]).trim() : "";
    if (val === "Jam Masuk" && idxJamMasuk === -1) idxJamMasuk = i;
    else if (val === "Jam Keluar" && idxJamMasuk !== -1 && idxJamKeluar === -1) idxJamKeluar = i;
  }
  // fallback pakai posisi umum dari template contoh jika deteksi otomatis gagal
  if (idxJamMasuk === -1) idxJamMasuk = 9;
  if (idxJamKeluar === -1) idxJamKeluar = idxJamMasuk + 3; // Jam Masuk, Istirahat, Selesai Istirahat, Jam Keluar => +3

  // Kolom "Total > Kehadiran" (total jam kerja terhitung) dicari di headerRow1 "Total"
  const idxTotalGroup = idxOf("Total", headerRow1);
  if (idxTotalGroup > -1) {
    for (let i = idxTotalGroup; i < headerRow2.length; i++) {
      if (headerRow2[i] && String(headerRow2[i]).trim() === "Kehadiran") { idxTotalKehadiran = i; break; }
    }
  }
  if (idxTotalKehadiran === -1) idxTotalKehadiran = idxJamKeluar + 5;

  const dataStart = headerRowIdx + 2;
  const hari = [];
  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c === null || c === "")) continue;
    const tanggal = row[col.tanggal];
    if (!tanggal) continue;
    hari.push({
      tanggal,
      status: (row[col.status] || "").toString().trim(),
      keterangan: (row[col.keterangan] || "").toString().trim(),
      dailyReport: (row[col.dailyReport] || "").toString().trim(),
      jamMasuk: row[idxJamMasuk] ? String(row[idxJamMasuk]).trim() : "-",
      jamKeluar: row[idxJamKeluar] ? String(row[idxJamKeluar]).trim() : "-"
    });
  }
  return hitungRekapDariHarian(hari);
}

function hitungRekapDariHarian(hari) {
  const cfg = DB.config;
  const jamMasukStd = timeToMinutes(cfg.jamMasuk) ?? 480;
  const jamPulangStd = timeToMinutes(cfg.jamPulang) ?? 960;
  const toleransi = Number(cfg.toleransiMenit) || 15;
  const gajiPokokPerJam = null; // dihitung nanti saat generate slip (butuh gaji pokok pegawai)

  let jamTelatTotal = 0;
  let jamLupaAbsenTotal = 0;
  let hariMangkir = 0;
  let jamPulangAwalTotal = 0;
  let jumlahTidakDailyReport = 0;
  let jumlahSakit = 0;
  let jumlahCutiTahunan = 0;
  let jumlahCutiSetengahHari = 0;
  let jumlahHadir = 0;

  hari.forEach(h => {
    const status = h.status.toLowerCase();
    const isHadir = status.includes("hadir di hari kerja") || status.includes("hhk");
    const isBukanHariKerja = status.includes("bukan hari kerja") || status.includes("bhk");
    const isCutiBersama = status.includes("cuti bersama");
    const isSakit = status.includes("sakit");
    const isCutiTahunan = status.includes("cuti tahunan") || status.includes("cuti (") || (status.includes("cuti") && !isCutiBersama && !status.includes("setengah") && !status.includes("tidak dibayar"));
    const isCutiSetengah = status.includes("setengah hari");
    const isTidakHadir = status.includes("tidak hadir") || status.includes("mangkir") || status.includes("alpha");

    if (isSakit) jumlahSakit += 1;
    if (isCutiSetengah) jumlahCutiSetengahHari += 0.5;
    else if (isCutiTahunan) jumlahCutiTahunan += 1;
    if (isTidakHadir) hariMangkir += 1;

    if (isHadir) {
      jumlahHadir += 1;
      const masukMin = timeToMinutes(h.jamMasuk);
      const keluarMin = timeToMinutes(h.jamKeluar);

      if (masukMin === null) {
        jamLupaAbsenTotal += 4; // lupa absen masuk
      } else if (masukMin > jamMasukStd + toleransi) {
        const selisih = masukMin - jamMasukStd;
        jamTelatTotal += Math.ceil(selisih / 60);
      }

      if (keluarMin === null) {
        jamLupaAbsenTotal += 4; // lupa absen keluar
      } else if (keluarMin < jamPulangStd) {
        const selisih = jamPulangStd - keluarMin;
        jamPulangAwalTotal += Math.ceil(selisih / 60);
      }

      if (h.dailyReport && !/on-?time/i.test(h.dailyReport)) {
        jumlahTidakDailyReport += 1;
      }
    }
  });

  return {
    sumber: "detail",
    jumlahHadir,
    jamTelatTotal,
    jamLupaAbsenTotal,
    hariMangkir,
    jamPulangAwalTotal,
    jumlahTidakDailyReport,
    jumlahSakit,
    jumlahCutiTahunan: jumlahCutiTahunan + jumlahCutiSetengahHari,
    detailHarian: hari
  };
}

function parseSheetRingkasan(rows, namaPegawai) {
  // cari header row
  let headerRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.some(c => String(c).trim() === "Nama") && row.some(c => String(c).trim() === "Sakit")) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) return null;
  const header = rows[headerRowIdx];
  const idxOf = (label) => header.findIndex(c => c && String(c).trim() === label);
  const iNama = idxOf("Nama");
  const iTerlambat = idxOf("Jumlah Hari Terlambat");
  const iBelumLengkap = idxOf("Belum Lengkap");
  const iSakit = idxOf("Sakit");
  const iCutiTahunan = idxOf("Cuti Tahunan");
  const iCutiSetengah = idxOf("Cuti Setengah Hari");
  const iTidakHadir = idxOf("Tidak hadir");
  const iHariKehadiran = idxOf("Hari kehadiran");

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const nama = row[iNama];
    if (!nama) continue;
    if (namaPegawai && String(nama).trim().toLowerCase() !== namaPegawai.trim().toLowerCase()) continue;
    const hariTerlambat = Number(row[iTerlambat]) || 0;
    const belumLengkap = Number(row[iBelumLengkap]) || 0;
    return {
      sumber: "ringkasan",
      jumlahHadir: Number(row[iHariKehadiran]) || 0,
      jamTelatTotal: hariTerlambat * 1, // pendekatan: tiap hari terlambat dihitung 1 jam
      jamLupaAbsenTotal: belumLengkap * 4,
      hariMangkir: Number(row[iTidakHadir]) || 0,
      jamPulangAwalTotal: 0,
      jumlahTidakDailyReport: 0,
      jumlahSakit: Number(row[iSakit]) || 0,
      jumlahCutiTahunan: (Number(row[iCutiTahunan]) || 0) + (Number(row[iCutiSetengah]) || 0),
      detailHarian: null
    };
  }
  return null;
}

/* ---------------------------------------------------------
   SLIP GAJI - kalkulasi & render
--------------------------------------------------------- */
let currentSlipCalc = null;

function muatDanHitungSlip() {
  const personaliaId = document.getElementById("selSlipPegawai").value;
  const p = getPersonaliaById(personaliaId);
  if (!p) { alert("Pilih pegawai terlebih dahulu"); return; }

  const rekap = DB.kehadiranImport[personaliaId];
  if (!rekap) {
    if (!confirm("Belum ada data kehadiran yang diimpor untuk pegawai ini. Lanjutkan tanpa perhitungan otomatis potongan kehadiran?")) return;
  }
  const cfg = DB.config;
  const gajiPokok = p.gajiPokok;
  const perJam = gajiPokok / cfg.hariKerjaPerBulan / cfg.jamKerjaPerHari;
  const perHari = gajiPokok / cfg.hariKerjaPerBulan;

  const r = rekap || { jamTelatTotal: 0, jamLupaAbsenTotal: 0, hariMangkir: 0, jamPulangAwalTotal: 0, jumlahTidakDailyReport: 0, jumlahSakit: 0, jumlahCutiTahunan: 0 };

  const potTelat = round2(perJam * r.jamTelatTotal);
  const potLupaAbsen = round2(perJam * r.jamLupaAbsenTotal);
  const potMangkir = round2(perHari * (r.hariMangkir * 2));
  const potDailyReport = round2(perJam * 4 * r.jumlahTidakDailyReport);
  const potLeaveEarly = round2(perJam * r.jamPulangAwalTotal);

  currentSlipCalc = {
    personaliaId,
    potTelat, potLupaAbsen, potMangkir, potDailyReport, potLeaveEarly,
    jamTelatTotal: r.jamTelatTotal, jamLupaAbsenTotal: r.jamLupaAbsenTotal,
    hariMangkir: r.hariMangkir, jumlahTidakDailyReport: r.jumlahTidakDailyReport,
    jamPulangAwalTotal: r.jamPulangAwalTotal,
    jumlahSakitPeriode: r.jumlahSakit || 0,
    jumlahCutiPeriode: r.jumlahCutiTahunan || 0
  };

  document.getElementById("autoCalcSummary").innerHTML = `
    <div class="calc-item">Telat (${r.jamTelatTotal} jam)<b>${formatRupiah(potTelat)}</b></div>
    <div class="calc-item">Lupa Absen (${r.jamLupaAbsenTotal} jam)<b>${formatRupiah(potLupaAbsen)}</b></div>
    <div class="calc-item">Mangkir (${r.hariMangkir} hari)<b>${formatRupiah(potMangkir)}</b></div>
    <div class="calc-item">Daily Report (${r.jumlahTidakDailyReport}x)<b>${formatRupiah(potDailyReport)}</b></div>
    <div class="calc-item">Pulang Awal (${r.jamPulangAwalTotal} jam)<b>${formatRupiah(potLeaveEarly)}</b></div>
    <div class="calc-item">Sakit periode ini<b>${r.jumlahSakit || 0} hari</b></div>
    <div class="calc-item">Cuti periode ini<b>${r.jumlahCutiTahunan || 0} hari</b></div>
  `;
  document.getElementById("slipAdjustPanel").style.display = "block";
  document.getElementById("slipPreviewPanel").style.display = "none";
}

function generateSlip() {
  const p = getPersonaliaById(currentSlipCalc.personaliaId);
  const cfg = DB.config;
  const bulanLabel = document.getElementById("inpSlipBulan").value.trim() || "-";
  const cutOff = document.getElementById("inpCutOff").value;

  const sakitTerpakaiBaru = (Number(p.sakitTerpakai) || 0); // sudah termasuk surat sakit + akan ditambah dari import periode ini jika mau digabung manual
  const sisaSakit = Math.max(0, p.jatahSakit - sakitTerpakaiBaru);

  const masaKerja = diffMasaKerja(p.tglBergabung, cutOff || new Date());
  const jatahCutiEfektif = masaKerja.totalBulan < 12 ? 0 : p.jatahCuti;
  const cutiTerpakaiBaru = (Number(p.cutiTerpakai) || 0) + (currentSlipCalc.jumlahCutiPeriode || 0);
  const sisaCuti = Math.max(0, jatahCutiEfektif - cutiTerpakaiBaru);

  const thr = Number(document.getElementById("adjTHR").value) || 0;
  const tunjLiburan = Number(document.getElementById("adjTunjLiburan").value) || 0;
  const lembur = Number(document.getElementById("adjLembur").value) || 0;
  const bpjs = Number(document.getElementById("adjBPJS").value) || 0;
  const kasbon = Number(document.getElementById("adjKasbon").value) || 0;
  const konversiCuti = Number(document.getElementById("adjKonversiCuti").value) || 0;

  const totalPenerimaan = round2(p.gajiPokok + thr + tunjLiburan + lembur + p.tunjTransport + p.tunjMakan + bpjs + konversiCuti);
  const totalPemotongan = round2(kasbon + currentSlipCalc.potTelat + currentSlipCalc.potLupaAbsen + currentSlipCalc.potMangkir + currentSlipCalc.potDailyReport + currentSlipCalc.potLeaveEarly);
  const thp = round2(totalPenerimaan - totalPemotongan);

  const slipData = {
    id: uid(),
    personaliaId: p.id,
    nama: p.nama,
    jabatan: p.jabatan,
    periodeLabel: bulanLabel,
    cutOff,
    tglBergabung: p.tglBergabung,
    masaKerjaLabel: masaKerja.label,
    jatahSakit: p.jatahSakit,
    sakitTerpakai: sakitTerpakaiBaru,
    sisaSakit,
    visitInOut: p.visitInOut,
    jatahCuti: jatahCutiEfektif,
    cutiTerpakai: cutiTerpakaiBaru,
    sisaCuti,
    penerimaan: {
      gajiPokok: p.gajiPokok, thr, tunjLiburan, lembur,
      transport: p.tunjTransport, makan: p.tunjMakan, bpjs, konversiCuti, total: totalPenerimaan
    },
    pemotongan: {
      kasbon, telat: currentSlipCalc.potTelat, lupaAbsen: currentSlipCalc.potLupaAbsen,
      mangkir: currentSlipCalc.potMangkir, dailyReport: currentSlipCalc.potDailyReport,
      leaveEarly: currentSlipCalc.potLeaveEarly, total: totalPemotongan
    },
    thp,
    dibuatPada: new Date().toISOString()
  };

  renderSlipPreview(slipData);
  document.getElementById("slipPreviewPanel").style.display = "block";
  document.getElementById("slipPreviewPanel").dataset.pending = JSON.stringify(slipData);
  document.getElementById("slipPreviewPanel").scrollIntoView({ behavior: "smooth" });
}

function renderSlipPreview(s) {
  const cfg = DB.config;
  const html = `
  <div class="slip-sheet">
    <div class="slip-header">
      <div class="company">${escapeHtml(cfg.namaPerusahaan)}</div>
      <div class="addr">${escapeHtml(cfg.alamat1)}<br>${escapeHtml(cfg.alamat2)}<br>${escapeHtml(cfg.alamat3)}</div>
    </div>
    <div class="slip-title">SLIP GAJI ${escapeHtml(s.periodeLabel.toUpperCase())}</div>
    <div class="slip-cols">
      <div>
        <div class="slip-row"><span>Nama</span><span>:</span><span>${escapeHtml(s.nama)}</span></div>
        <div class="slip-row"><span>Jabatan</span><span>:</span><span>${escapeHtml(s.jabatan)}</span></div>
        <div class="slip-row"><span>Jumlah Jatah Sakit</span><span>:</span><span>${s.jatahSakit}</span></div>
        <div class="slip-row"><span>Jumlah Sakit Terpakai</span><span>:</span><span>${s.sakitTerpakai}</span></div>
        <div class="slip-row"><span>Sisa Jatah Sakit</span><span>:</span><span>${s.sisaSakit}</span></div>
        <div class="slip-row"><span>Visit in/out</span><span>:</span><span>${s.visitInOut}</span></div>
      </div>
      <div>
        <div class="slip-row"><span>Tanggal Bergabung</span><span>:</span><span>${s.tglBergabung ? formatTglIndo(s.tglBergabung) : "-"}</span></div>
        <div class="slip-row"><span>Total Masa Kerja</span><span>:</span><span>${s.masaKerjaLabel}</span></div>
        <div class="slip-row"><span>Jumlah Jatah Cuti</span><span>:</span><span>${s.jatahCuti}</span></div>
        <div class="slip-row"><span>Jatah Cuti Terpakai</span><span>:</span><span>${s.cutiTerpakai}</span></div>
        <div class="slip-row"><span>Sisa Jatah Cuti</span><span>:</span><span>${s.sisaCuti}</span></div>
        <div class="slip-row"><span>Batas Cut Off</span><span>:</span><span>${s.cutOff ? formatTglIndo(s.cutOff) : "-"}</span></div>
      </div>
    </div>

    <div class="slip-cols">
      <div>
        <div class="slip-section-title">PENERIMAAN</div>
        <div class="slip-money-row"><span>Gaji Pokok</span><span>:</span><span>${formatRupiah(s.penerimaan.gajiPokok)}</span></div>
        <div class="slip-money-row"><span>THR</span><span>:</span><span>${s.penerimaan.thr ? formatRupiah(s.penerimaan.thr) : "-"}</span></div>
        <div class="slip-money-row"><span>Tunjangan Liburan</span><span>:</span><span>${s.penerimaan.tunjLiburan ? formatRupiah(s.penerimaan.tunjLiburan) : "-"}</span></div>
        <div class="slip-money-row"><span>Lembur</span><span>:</span><span>${s.penerimaan.lembur ? formatRupiah(s.penerimaan.lembur) : "-"}</span></div>
        <div class="slip-money-row"><span>Transport</span><span>:</span><span>${formatRupiah(s.penerimaan.transport)}</span></div>
        <div class="slip-money-row"><span>Uang Makan</span><span>:</span><span>${formatRupiah(s.penerimaan.makan)}</span></div>
        <div class="slip-money-row"><span>BPJS Kesehatan</span><span>:</span><span>${s.penerimaan.bpjs ? formatRupiah(s.penerimaan.bpjs) : "-"}</span></div>
        <div class="slip-money-row"><span>Konversi Cuti</span><span>:</span><span>${s.penerimaan.konversiCuti ? formatRupiah(s.penerimaan.konversiCuti) : "-"}</span></div>
        <div class="slip-money-row slip-total"><span>TOTAL PENERIMAAN</span><span>:</span><span>${formatRupiah(s.penerimaan.total)}</span></div>
      </div>
      <div>
        <div class="slip-section-title">PEMOTONGAN</div>
        <div class="slip-money-row"><span>Kasbon</span><span>:</span><span>${s.pemotongan.kasbon ? formatRupiah(s.pemotongan.kasbon) : "-"}</span></div>
        <div class="slip-money-row"><span>Telat</span><span>:</span><span>${s.pemotongan.telat ? formatRupiah(s.pemotongan.telat) : "-"}</span></div>
        <div class="slip-money-row"><span>Lupa Absen</span><span>:</span><span>${s.pemotongan.lupaAbsen ? formatRupiah(s.pemotongan.lupaAbsen) : "-"}</span></div>
        <div class="slip-money-row"><span>Mangkir</span><span>:</span><span>${s.pemotongan.mangkir ? formatRupiah(s.pemotongan.mangkir) : "-"}</span></div>
        <div class="slip-money-row"><span>Daily Report</span><span>:</span><span>${s.pemotongan.dailyReport ? formatRupiah(s.pemotongan.dailyReport) : "-"}</span></div>
        <div class="slip-money-row"><span>Leave Early</span><span>:</span><span>${s.pemotongan.leaveEarly ? formatRupiah(s.pemotongan.leaveEarly) : "-"}</span></div>
        <div class="slip-money-row slip-total"><span>TOTAL PEMOTONGAN</span><span>:</span><span>${formatRupiah(s.pemotongan.total)}</span></div>
      </div>
    </div>

    <div class="slip-thp"><span>THP (Take Home Pay)</span><span>${formatRupiah(s.thp)}</span></div>

    <div class="slip-sign">
      <div><div>Payroll</div><div class="line">&nbsp;</div></div>
      <div><div>Diterima Oleh,</div><div class="line">${escapeHtml(s.nama)}</div></div>
    </div>
  </div>`;
  document.getElementById("slipContainer").innerHTML = html;
}

function simpanSlipKeRiwayat() {
  const pending = document.getElementById("slipPreviewPanel").dataset.pending;
  if (!pending) return;
  const slipData = JSON.parse(pending);
  DB.riwayatSlip.push(slipData);
  // update baseline personalia untuk periode berikutnya
  const p = getPersonaliaById(slipData.personaliaId);
  if (p) {
    p.sakitTerpakai = slipData.sakitTerpakai;
    p.cutiTerpakai = slipData.cutiTerpakai;
  }
  saveDB();
  renderPersonaliaTable();
  renderRiwayatTable();
  renderDashboard();
  alert("Slip berhasil disimpan ke riwayat.");
}

/* ---------------------------------------------------------
   RIWAYAT
--------------------------------------------------------- */
function renderRiwayatTable() {
  const tbody = document.querySelector("#tblRiwayat tbody");
  tbody.innerHTML = "";
  DB.riwayatSlip.slice().reverse().forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.nama)}</td>
      <td>${escapeHtml(s.periodeLabel)}</td>
      <td>${formatRupiah(s.thp)}</td>
      <td>${new Date(s.dibuatPada).toLocaleString("id-ID")}</td>
      <td><button class="btn-icon" data-action="lihat-slip" data-id="${s.id}">Lihat</button></td>`;
    tbody.appendChild(tr);
  });
}

function lihatSlipRiwayat(id) {
  const s = DB.riwayatSlip.find(x => x.id === id);
  if (!s) return;
  navigateTo("slip");
  document.getElementById("slipAdjustPanel").style.display = "none";
  renderSlipPreview(s);
  document.getElementById("slipPreviewPanel").style.display = "block";
  document.getElementById("slipPreviewPanel").dataset.pending = "";
}

/* ---------------------------------------------------------
   DASHBOARD
--------------------------------------------------------- */
function renderDashboard() {
  const totalPegawai = DB.personalia.length;
  const totalSlipBulanIni = DB.riwayatSlip.length;
  const totalTHP = DB.riwayatSlip.reduce((a, s) => a + (s.thp || 0), 0);
  const totalSakitAktif = DB.personalia.reduce((a, p) => a + ((p.jatahSakit || 0) - (p.sakitTerpakai || 0)), 0);

  document.getElementById("dashboardCards").innerHTML = `
    <div class="card"><div class="num">${totalPegawai}</div><div class="label">Total Personalia</div></div>
    <div class="card"><div class="num">${totalSlipBulanIni}</div><div class="label">Slip Dibuat</div></div>
    <div class="card"><div class="num">${formatRupiah(totalTHP)}</div><div class="label">Total THP Tersalur</div></div>
    <div class="card"><div class="num">${totalSakitAktif}</div><div class="label">Sisa Jatah Sakit (semua pegawai)</div></div>
  `;

  const recent = DB.riwayatSlip.slice(-5).reverse();
  if (recent.length === 0) {
    document.getElementById("dashboardRecentSlips").innerHTML = "<p style='color:#94a3b8'>Belum ada slip yang dibuat.</p>";
  } else {
    document.getElementById("dashboardRecentSlips").innerHTML = `
      <table class="data-table">
        <thead><tr><th>Nama</th><th>Periode</th><th>THP</th></tr></thead>
        <tbody>${recent.map(s => `<tr><td>${escapeHtml(s.nama)}</td><td>${escapeHtml(s.periodeLabel)}</td><td>${formatRupiah(s.thp)}</td></tr>`).join("")}</tbody>
      </table>`;
  }
}

/* ---------------------------------------------------------
   PENGATURAN
--------------------------------------------------------- */
function renderPengaturanForm() {
  const c = DB.config;
  document.getElementById("cfgNamaPerusahaan").value = c.namaPerusahaan;
  document.getElementById("cfgAlamat1").value = c.alamat1;
  document.getElementById("cfgAlamat2").value = c.alamat2;
  document.getElementById("cfgAlamat3").value = c.alamat3;
  document.getElementById("cfgJamMasuk").value = c.jamMasuk;
  document.getElementById("cfgJamPulang").value = c.jamPulang;
  document.getElementById("cfgToleransi").value = c.toleransiMenit;
  document.getElementById("cfgHariKerja").value = c.hariKerjaPerBulan;
  document.getElementById("cfgJamKerja").value = c.jamKerjaPerHari;
  document.getElementById("companyNameLabel").textContent = c.namaPerusahaan;
}

function simpanPengaturan() {
  DB.config = {
    namaPerusahaan: document.getElementById("cfgNamaPerusahaan").value,
    alamat1: document.getElementById("cfgAlamat1").value,
    alamat2: document.getElementById("cfgAlamat2").value,
    alamat3: document.getElementById("cfgAlamat3").value,
    jamMasuk: document.getElementById("cfgJamMasuk").value,
    jamPulang: document.getElementById("cfgJamPulang").value,
    toleransiMenit: Number(document.getElementById("cfgToleransi").value),
    hariKerjaPerBulan: Number(document.getElementById("cfgHariKerja").value),
    jamKerjaPerHari: Number(document.getElementById("cfgJamKerja").value)
  };
  saveDB();
  document.getElementById("companyNameLabel").textContent = DB.config.namaPerusahaan;
  alert("Pengaturan disimpan.");
}

/* ---------------------------------------------------------
   NAVIGASI
--------------------------------------------------------- */
function navigateTo(pageKey) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + pageKey).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === pageKey));
  const titles = {
    dashboard: "Dashboard", personalia: "Personalia", kehadiran: "Import Kehadiran",
    sakit: "Surat Sakit", slip: "Slip Gaji", riwayat: "Riwayat Slip", pengaturan: "Pengaturan"
  };
  document.getElementById("pageTitleMobile").textContent = titles[pageKey] || "";
  document.getElementById("sidebar").classList.remove("open");
}

/* ---------------------------------------------------------
   EKSPOR / IMPOR DATA (backup)
--------------------------------------------------------- */
function eksporData() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup-penggajian-${isoDate(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importDataFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!confirm("Impor data ini akan menimpa seluruh data yang ada saat ini. Lanjutkan?")) return;
      DB = parsed;
      DB.config = Object.assign({}, DEFAULT_CONFIG, DB.config || {});
      DB.personalia = DB.personalia || [];
      DB.suratSakit = DB.suratSakit || [];
      DB.riwayatSlip = DB.riwayatSlip || [];
      DB.kehadiranImport = DB.kehadiranImport || {};
      saveDB();
      renderAll();
      alert("Data berhasil diimpor.");
    } catch (err) {
      alert("Gagal membaca file: " + err.message);
    }
  };
  reader.readAsText(file);
}

function renderAll() {
  renderPersonaliaTable();
  populateAllPersonaliaSelects();
  renderSakitTable();
  renderRiwayatTable();
  renderDashboard();
  renderPengaturanForm();
}

/* ---------------------------------------------------------
   EVENT BINDINGS
--------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  renderAll();

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.page));
  });
  document.getElementById("btnMenuToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
  document.getElementById("btnCollapseSidebar").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("collapsed");
  });

  // Personalia
  document.getElementById("btnTambahPersonalia").addEventListener("click", () => openModalPersonalia(null));
  document.getElementById("btnBatalPersonalia").addEventListener("click", closeModalPersonalia);
  document.getElementById("btnSimpanPersonalia").addEventListener("click", simpanPersonalia);
  document.getElementById("fTotalGaji").addEventListener("input", updateSplitPreview);
  document.querySelector("#tblPersonalia tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.action === "edit-personalia") openModalPersonalia(btn.dataset.id);
    if (btn.dataset.action === "hapus-personalia") hapusPersonalia(btn.dataset.id);
  });

  // Surat Sakit
  document.getElementById("btnTambahSakit").addEventListener("click", () => {
    document.getElementById("fSakitPegawai").innerHTML = DB.personalia.map(p => `<option value="${p.id}">${escapeHtml(p.nama)}</option>`).join("");
    document.getElementById("fSakitKeterangan").value = "";
    document.getElementById("fSakitMulai").value = "";
    document.getElementById("fSakitSelesai").value = "";
    document.getElementById("modalSakit").classList.add("active");
  });
  document.getElementById("btnBatalSakit").addEventListener("click", () => document.getElementById("modalSakit").classList.remove("active"));
  document.getElementById("btnSimpanSakit").addEventListener("click", simpanSuratSakit);
  document.querySelector("#tblSakit tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.action === "hapus-sakit") hapusSuratSakit(btn.dataset.id);
  });

  // Import Kehadiran
  document.getElementById("btnProsesKehadiran").addEventListener("click", () => {
    const fileInput = document.getElementById("fileKehadiran");
    const personaliaId = document.getElementById("selKehadiranPegawai").value;
    if (!fileInput.files[0]) { alert("Pilih file Excel terlebih dahulu"); return; }
    if (!personaliaId) { alert("Pilih personalia terlebih dahulu"); return; }
    prosesFileKehadiran(fileInput.files[0], personaliaId, (hasil) => {
      if (!hasil) {
        document.getElementById("kehadiranPreview").innerHTML = "<p style='color:#dc2626'>Format file tidak dikenali. Pastikan sheet berisi kolom Tanggal/Status atau sheet Ringkasan Kehadiran.</p>";
        return;
      }
      DB.kehadiranImport[personaliaId] = hasil;
      saveDB();
      document.getElementById("kehadiranPreview").innerHTML = `
        <p style="color:#16a34a">Berhasil diproses dari sumber: <b>${hasil.sumber}</b></p>
        <div class="calc-summary">
          <div class="calc-item">Hari Hadir<b>${hasil.jumlahHadir}</b></div>
          <div class="calc-item">Jam Telat<b>${hasil.jamTelatTotal}</b></div>
          <div class="calc-item">Jam Lupa Absen<b>${hasil.jamLupaAbsenTotal}</b></div>
          <div class="calc-item">Hari Mangkir<b>${hasil.hariMangkir}</b></div>
          <div class="calc-item">Jam Pulang Awal<b>${hasil.jamPulangAwalTotal}</b></div>
          <div class="calc-item">Tidak Daily Report<b>${hasil.jumlahTidakDailyReport}x</b></div>
          <div class="calc-item">Sakit<b>${hasil.jumlahSakit} hari</b></div>
          <div class="calc-item">Cuti Tahunan<b>${hasil.jumlahCutiTahunan} hari</b></div>
        </div>`;
    });
  });

  // Slip
  document.getElementById("btnMuatDataSlip").addEventListener("click", muatDanHitungSlip);
  document.getElementById("btnGenerateSlip").addEventListener("click", generateSlip);
  document.getElementById("btnPrintSlip").addEventListener("click", () => window.print());
  document.getElementById("btnSimpanSlip").addEventListener("click", simpanSlipKeRiwayat);

  // Riwayat
  document.querySelector("#tblRiwayat tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.action === "lihat-slip") lihatSlipRiwayat(btn.dataset.id);
  });

  // Pengaturan
  document.getElementById("btnSimpanPengaturan").addEventListener("click", simpanPengaturan);

  // Ekspor/Impor backup
  document.getElementById("btnExportData").addEventListener("click", eksporData);
  document.getElementById("btnImportData").addEventListener("click", () => document.getElementById("fileImportData").click());
  document.getElementById("fileImportData").addEventListener("change", (e) => {
    if (e.target.files[0]) importDataFile(e.target.files[0]);
  });

  // Register service worker (PWA)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(err => console.warn("SW gagal:", err));
    });
  }
});
