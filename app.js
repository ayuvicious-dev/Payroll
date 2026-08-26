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
  logoUrl: "",
  jamMasuk: "08:00",
  jamPulang: "16:00",
  jamPulangSabtu: "13:00",
  toleransiMenit: 15,
  hariKerjaPerBulan: 26,
  jamKerjaPerHari: 8
};

let DB = loadDB();
window.DB = DB; // alias supaya bisa diakses dari firebase-init.js (module terpisah)

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
  // Hook ke Firestore (didefinisikan di firebase-init.js setelah user login)
  if (typeof window.onDBSaved === "function") window.onDBSaved();
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
    const fotoCell = s.fotoUrl
      ? `<img src="${s.fotoUrl}" class="sakit-thumb" data-action="lihat-foto-sakit" data-id="${s.id}" alt="Foto surat sakit">`
      : "-";
    tr.innerHTML = `
      <td>${p ? escapeHtml(p.nama) : "(dihapus)"}</td>
      <td>${formatTglIndo(s.tglMulai)}</td>
      <td>${formatTglIndo(s.tglSelesai)}</td>
      <td>${s.jumlahHari}</td>
      <td>${escapeHtml(s.keterangan || "-")}</td>
      <td>${fotoCell}</td>
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

/* Kompres foto di sisi browser sebelum disimpan sebagai base64 di Firestore
   (dokumen Firestore dibatasi ~1MB, jadi foto WAJIB dikecilkan dulu). */
function compressImageToBase64(file, maxDim = 900, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.onload = (e) => {
      img.onerror = () => reject(new Error("File bukan gambar yang valid"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

let __sakitFotoBase64 = null;
let __logoBase64 = null;

function resetFormFotoSakit() {
  __sakitFotoBase64 = null;
  document.getElementById("fSakitFoto").value = "";
  document.getElementById("fSakitFotoPreviewWrap").style.display = "none";
  document.getElementById("fSakitFotoPreview").src = "";
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
    keterangan: document.getElementById("fSakitKeterangan").value.trim(),
    fotoUrl: __sakitFotoBase64 || null
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
  resetFormFotoSakit();
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
  const jamPulangStdNormal = timeToMinutes(cfg.jamPulang) ?? 960;
  const jamPulangStdSabtu = timeToMinutes(cfg.jamPulangSabtu) ?? jamPulangStdNormal;
  const toleransi = Number(cfg.toleransiMenit) || 15;
  const gajiPokokPerJam = null; // dihitung nanti saat generate slip (butuh gaji pokok pegawai)

  function isHariSabtu(tanggalRaw) {
    const d = parseDateFlexible(tanggalRaw);
    return d ? d.getDay() === 6 : false; // 6 = Sabtu
  }

  let jamTelatTotal = 0;
  let jamLupaAbsenTotal = 0;
  let hariMangkir = 0;
  let jamPulangAwalTotal = 0;
  let jumlahTidakDailyReport = 0;
  let jumlahSakit = 0;
  let jumlahCutiTahunan = 0;
  let jumlahCutiSetengahHari = 0;
  let jumlahHadir = 0;

  const rincianTelat = [];
  const rincianLupaAbsen = [];
  const rincianMangkir = [];
  const rincianDailyReport = [];
  const rincianPulangAwal = [];
  const rincianSakit = [];
  const rincianCuti = [];

  hari.forEach(h => {
    const status = h.status.toLowerCase();
    const isHadir = status.includes("hadir di hari kerja") || status.includes("hhk");
    const isBukanHariKerja = status.includes("bukan hari kerja") || status.includes("bhk");
    const isCutiBersama = status.includes("cuti bersama");
    const isSakit = status.includes("sakit");
    const isCutiTahunan = status.includes("cuti tahunan") || status.includes("cuti (") || (status.includes("cuti") && !isCutiBersama && !status.includes("setengah") && !status.includes("tidak dibayar"));
    const isCutiSetengah = status.includes("setengah hari");
    const isTidakHadir = status.includes("tidak hadir") || status.includes("mangkir") || status.includes("alpha");

    if (isSakit) {
      jumlahSakit += 1;
      rincianSakit.push({ tanggal: h.tanggal, status: h.status, keterangan: h.keterangan });
    }
    if (isCutiSetengah) {
      jumlahCutiSetengahHari += 0.5;
      rincianCuti.push({ tanggal: h.tanggal, status: h.status, keterangan: h.keterangan, jumlah: 0.5 });
    } else if (isCutiTahunan) {
      jumlahCutiTahunan += 1;
      rincianCuti.push({ tanggal: h.tanggal, status: h.status, keterangan: h.keterangan, jumlah: 1 });
    }
    if (isTidakHadir) {
      hariMangkir += 1;
      rincianMangkir.push({ tanggal: h.tanggal, status: h.status, keterangan: h.keterangan });
    }

    if (isHadir) {
      jumlahHadir += 1;
      const masukMin = timeToMinutes(h.jamMasuk);
      const keluarMin = timeToMinutes(h.jamKeluar);

      if (masukMin === null) {
        jamLupaAbsenTotal += 4; // lupa absen masuk
        rincianLupaAbsen.push({ tanggal: h.tanggal, jenis: "Jam Masuk", jam: 4 });
      } else if (masukMin > jamMasukStd + toleransi) {
        const selisih = masukMin - jamMasukStd;
        const jamTelat = Math.ceil(selisih / 60);
        jamTelatTotal += jamTelat;
        rincianTelat.push({ tanggal: h.tanggal, jamMasuk: h.jamMasuk, jamTelat });
      }

      if (keluarMin === null) {
        jamLupaAbsenTotal += 4; // lupa absen keluar
        rincianLupaAbsen.push({ tanggal: h.tanggal, jenis: "Jam Keluar", jam: 4 });
      } else {
        const jamPulangStd = isHariSabtu(h.tanggal) ? jamPulangStdSabtu : jamPulangStdNormal;
        if (keluarMin < jamPulangStd) {
          const selisih = jamPulangStd - keluarMin;
          const jamKurang = Math.ceil(selisih / 60);
          jamPulangAwalTotal += jamKurang;
          rincianPulangAwal.push({ tanggal: h.tanggal, jamKeluar: h.jamKeluar, jamKurang });
        }
      }

      const drVal = h.dailyReport || "";
      const isDailyReportOnTime = /on[\s-]?time/i.test(drVal);
      if (!isDailyReportOnTime) {
        jumlahTidakDailyReport += 1;
        rincianDailyReport.push({ tanggal: h.tanggal, dailyReport: drVal || "Tidak diisi (off-time)" });
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
    detailHarian: hari,
    rincian: {
      telat: rincianTelat,
      lupaAbsen: rincianLupaAbsen,
      mangkir: rincianMangkir,
      dailyReport: rincianDailyReport,
      pulangAwal: rincianPulangAwal,
      sakit: rincianSakit,
      cuti: rincianCuti
    }
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
    jumlahCutiPeriode: r.jumlahCutiTahunan || 0,
    rincian: r.rincian || null,
    namaPegawai: p.nama
  };

  document.getElementById("autoCalcSummary").innerHTML = `
    <div class="calc-item calc-item-clickable" data-kategori="telat">Telat (${r.jamTelatTotal} jam)<b>${formatRupiah(potTelat)}</b></div>
    <div class="calc-item calc-item-clickable" data-kategori="lupaAbsen">Lupa Absen (${r.jamLupaAbsenTotal} jam)<b>${formatRupiah(potLupaAbsen)}</b></div>
    <div class="calc-item calc-item-clickable" data-kategori="mangkir">Mangkir (${r.hariMangkir} hari)<b>${formatRupiah(potMangkir)}</b></div>
    <div class="calc-item calc-item-clickable" data-kategori="dailyReport">Daily Report (${r.jumlahTidakDailyReport}x)<b>${formatRupiah(potDailyReport)}</b></div>
    <div class="calc-item calc-item-clickable" data-kategori="pulangAwal">Pulang Awal (${r.jamPulangAwalTotal} jam)<b>${formatRupiah(potLeaveEarly)}</b></div>
    <div class="calc-item calc-item-clickable" data-kategori="sakit">Sakit periode ini<b>${r.jumlahSakit || 0} hari</b></div>
    <div class="calc-item calc-item-clickable" data-kategori="cuti">Cuti periode ini<b>${r.jumlahCutiTahunan || 0} hari</b></div>
  `;
  document.getElementById("slipAdjustPanel").style.display = "block";
  document.getElementById("slipPreviewPanel").style.display = "none";
}

/* ---------------------------------------------------------
   DETAIL RINCIAN KEHADIRAN (modal saat kartu calc-item diklik)
--------------------------------------------------------- */
const KATEGORI_LABEL = {
  telat: "Telat",
  lupaAbsen: "Lupa Absen",
  mangkir: "Mangkir",
  dailyReport: "Daily Report",
  pulangAwal: "Pulang Awal",
  sakit: "Sakit",
  cuti: "Cuti"
};

function formatTanggalTampil(tanggalRaw) {
  const d = parseDateFlexible(tanggalRaw);
  if (!d) return String(tanggalRaw || "-");
  return d.toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function keteranganRincian(kategori, item) {
  switch (kategori) {
    case "telat":
      return `Jam masuk: ${item.jamMasuk} · Telat ${item.jamTelat} jam`;
    case "lupaAbsen":
      return `${item.jenis} tidak tercatat (dihitung ${item.jam} jam)`;
    case "mangkir":
      return `${item.status}${item.keterangan ? " — " + item.keterangan : ""}`;
    case "dailyReport":
      return `Status: ${item.dailyReport}`;
    case "pulangAwal":
      return `Jam keluar: ${item.jamKeluar} · Kurang ${item.jamKurang} jam`;
    case "sakit":
      return `${item.status}${item.keterangan ? " — " + item.keterangan : ""}`;
    case "cuti":
      return `${item.status}${item.keterangan ? " — " + item.keterangan : ""} (${item.jumlah} hari)`;
    default:
      return "";
  }
}

function bukaDetailKehadiran(kategori) {
  if (!currentSlipCalc) return;
  const label = KATEGORI_LABEL[kategori] || kategori;
  document.getElementById("modalDetailKehadiranTitle").textContent = `Rincian ${label} — ${currentSlipCalc.namaPegawai || ""}`;

  const body = document.getElementById("modalDetailKehadiranBody");

  if (!currentSlipCalc.rincian) {
    body.innerHTML = `<p class="preview-box">Rincian harian tidak tersedia untuk data ini (data berasal dari sheet ringkasan agregat, bukan sheet detail harian).</p>`;
    document.getElementById("modalDetailKehadiran").classList.add("active");
    return;
  }

  const list = currentSlipCalc.rincian[kategori] || [];
  if (list.length === 0) {
    body.innerHTML = `<p class="preview-box">Tidak ada rincian untuk kategori ini pada periode ini.</p>`;
    document.getElementById("modalDetailKehadiran").classList.add("active");
    return;
  }

  let rows = "";
  list.forEach(item => {
    const tgl = formatTanggalTampil(item.tanggal);
    const keterangan = keteranganRincian(kategori, item);
    rows += `<tr><td>${tgl}</td><td>${keterangan}</td></tr>`;
  });

  body.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Tanggal</th><th>Keterangan</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  document.getElementById("modalDetailKehadiran").classList.add("active");
}

function tutupDetailKehadiran() {
  document.getElementById("modalDetailKehadiran").classList.remove("active");
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
    ringkasanAbsensi: {
      jamTelatTotal: currentSlipCalc.jamTelatTotal || 0,
      jamLupaAbsenTotal: currentSlipCalc.jamLupaAbsenTotal || 0,
      hariMangkir: currentSlipCalc.hariMangkir || 0,
      jumlahTidakDailyReport: currentSlipCalc.jumlahTidakDailyReport || 0,
      jamPulangAwalTotal: currentSlipCalc.jamPulangAwalTotal || 0
    },
    rincianAbsensi: currentSlipCalc.rincian || null, // snapshot detail harian periode ini (untuk lampiran laporan)
    dibuatPada: new Date().toISOString()
  };

  renderSlipPreview(slipData);
  document.getElementById("slipPreviewPanel").style.display = "block";
  document.getElementById("slipPreviewPanel").dataset.pending = JSON.stringify(slipData);
  document.getElementById("slipPreviewPanel").scrollIntoView({ behavior: "smooth" });
}

function buildSlipSheetHtml(s) {
  const cfg = DB.config;
  return `
  <div class="slip-sheet">
    <div class="slip-header">
      ${cfg.logoUrl ? `<img class="slip-logo" src="${cfg.logoUrl}" alt="Logo Perusahaan">` : ""}
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
}

function renderSlipPreview(s) {
  document.getElementById("slipContainer").innerHTML = buildSlipSheetHtml(s);
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
  populateLaporanPeriodeSelect();
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
   LAPORAN PERIODE (PDF Keseluruhan: cover + semua slip + lampiran)
--------------------------------------------------------- */
function daftarPeriodeTersedia() {
  const set = new Set();
  DB.riwayatSlip.forEach(s => { if (s.periodeLabel) set.add(s.periodeLabel); });
  return Array.from(set);
}

function populateLaporanPeriodeSelect() {
  const sel = document.getElementById("selLaporanPeriode");
  if (!sel) return;
  const current = sel.value;
  const periodeList = daftarPeriodeTersedia();
  if (periodeList.length === 0) {
    sel.innerHTML = `<option value="">(Belum ada slip tersimpan)</option>`;
  } else {
    sel.innerHTML = periodeList.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
    if (current && periodeList.includes(current)) sel.value = current;
  }
}

// Cari surat sakit (dengan foto) milik seorang pegawai yang relevan untuk sebuah slip,
// yaitu yang tanggal mulainya jatuh setelah cut off slip SEBELUMNYA (pegawai yang sama)
// sampai dengan cut off slip ini sendiri.
function getSuratSakitUntukSlip(slip) {
  const cutOffCur = slip.cutOff ? parseDateFlexible(slip.cutOff) : null;

  const cutOffSlipLain = DB.riwayatSlip
    .filter(x => x.personaliaId === slip.personaliaId && x.id !== slip.id && x.cutOff)
    .map(x => parseDateFlexible(x.cutOff))
    .filter(d => d && (!cutOffCur || d < cutOffCur));
  const prevCutOff = cutOffSlipLain.length ? new Date(Math.max(...cutOffSlipLain.map(d => d.getTime()))) : null;

  return DB.suratSakit.filter(s => {
    if (s.personaliaId !== slip.personaliaId) return false;
    const tgl = parseDateFlexible(s.tglMulai);
    if (!tgl) return false;
    if (cutOffCur && tgl > cutOffCur) return false;
    if (prevCutOff && tgl <= prevCutOff) return false;
    return true;
  });
}

function buildCoverHtml(periodeLabel, slips) {
  const cfg = DB.config;
  const totalTHP = slips.reduce((a, s) => a + (s.thp || 0), 0);
  const sekarang = new Date().toLocaleString("id-ID");
  return `
  <div class="cetak-page laporan-cover">
    ${cfg.logoUrl ? `<img class="cover-logo" src="${cfg.logoUrl}" alt="Logo Perusahaan">` : ""}
    <div class="cover-title">SLIP GAJI</div>
    <div class="cover-company">${escapeHtml(cfg.namaPerusahaan)}</div>
    <div class="cover-addr">${escapeHtml(cfg.alamat1)}<br>${escapeHtml(cfg.alamat2)}<br>${escapeHtml(cfg.alamat3)}</div>
    <div class="cover-periode">PERIODE ${escapeHtml(periodeLabel.toUpperCase())}</div>
    <table class="cover-info-table">
      <tr><td>Jumlah Staff</td><td>: ${slips.length} orang</td></tr>
      <tr><td>Total THP Periode Ini</td><td>: ${formatRupiah(totalTHP)}</td></tr>
      <tr><td>Dokumen Dibuat</td><td>: ${sekarang}</td></tr>
    </table>
    <div class="cover-footer">
      Dokumen ini berisi slip gaji seluruh staff beserta lampiran rincian absensi dan surat sakit
      untuk periode ${escapeHtml(periodeLabel)}. Bersifat rahasia — hanya untuk pihak yang berkepentingan.
    </div>
  </div>`;
}

function buildLampiranTabelKategori(kategori, list) {
  if (!list || list.length === 0) {
    return `<div class="lampiran-empty">Tidak ada catatan ${KATEGORI_LABEL[kategori].toLowerCase()} pada periode ini.</div>`;
  }
  const rows = list.map(item => {
    const tgl = formatTanggalTampil(item.tanggal);
    return `<tr><td>${tgl}</td><td>${keteranganRincian(kategori, item)}</td></tr>`;
  }).join("");
  return `
    <table class="lampiran-table">
      <thead><tr><th>Tanggal</th><th>Keterangan</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function buildLampiranStaffHtml(slip) {
  const r = slip.rincianAbsensi;
  const kategoriUrut = ["telat", "lupaAbsen", "mangkir", "dailyReport", "pulangAwal", "cuti"];

  let absensiHtml;
  if (!r) {
    absensiHtml = `<div class="lampiran-empty">Rincian harian tidak tersedia untuk slip ini (data berasal dari sheet ringkasan agregat, atau slip dibuat sebelum fitur rincian tersimpan).</div>`;
  } else {
    absensiHtml = kategoriUrut.map(kat => `
        <div class="lampiran-section-title">${KATEGORI_LABEL[kat]}</div>
        ${buildLampiranTabelKategori(kat, r[kat])}`).join("");
  }

  const suratSakitList = getSuratSakitUntukSlip(slip);
  let sakitHtml;
  if (suratSakitList.length === 0) {
    sakitHtml = `<div class="lampiran-empty">Tidak ada surat sakit tercatat pada periode ini.</div>`;
  } else {
    const rows = suratSakitList.map(s => `
      <tr>
        <td>${formatTglIndo(s.tglMulai)}</td>
        <td>${formatTglIndo(s.tglSelesai)}</td>
        <td>${s.jumlahHari}</td>
        <td>${escapeHtml(s.keterangan || "-")}</td>
      </tr>`).join("");
    const fotoList = suratSakitList.filter(s => s.fotoUrl);
    const fotoHtml = fotoList.length
      ? `<div class="lampiran-foto-row">${fotoList.map(s => `<img src="${s.fotoUrl}" alt="Foto surat sakit ${escapeHtml(s.keterangan || "")}">`).join("")}</div>`
      : "";
    sakitHtml = `
      <table class="lampiran-table">
        <thead><tr><th>Tgl Mulai</th><th>Tgl Selesai</th><th>Jml Hari</th><th>Keterangan</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${fotoHtml}`;
  }

  return `
  <div class="cetak-page lampiran-sheet">
    <div class="lampiran-head">
      <div class="tag">LAMPIRAN — RINCIAN ABSENSI &amp; SURAT SAKIT</div>
      <div class="nama">${escapeHtml(slip.nama)}</div>
      <div class="sub">${escapeHtml(slip.jabatan || "-")} · Periode ${escapeHtml(slip.periodeLabel)}</div>
    </div>
    <div class="lampiran-section-title">RINCIAN ABSENSI</div>
    ${absensiHtml}
    <div class="lampiran-section-title">SURAT SAKIT</div>
    ${sakitHtml}
  </div>`;
}

function buatLaporanPeriode() {
  const sel = document.getElementById("selLaporanPeriode");
  const periodeLabel = sel.value;
  if (!periodeLabel) { alert("Belum ada slip yang tersimpan untuk periode manapun. Buat & simpan slip terlebih dahulu di halaman Slip Gaji."); return; }

  const slips = DB.riwayatSlip
    .filter(s => s.periodeLabel === periodeLabel)
    .slice()
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));

  if (slips.length === 0) { alert("Tidak ada slip untuk periode ini."); return; }

  const coverHtml = buildCoverHtml(periodeLabel, slips);
  const slipPagesHtml = slips.map(s => `<div class="cetak-page">${buildSlipSheetHtml(s)}</div>`).join("");
  const lampiranHtml = slips.map(s => buildLampiranStaffHtml(s)).join("");

  document.getElementById("laporanContainer").innerHTML = coverHtml + slipPagesHtml + lampiranHtml;
  document.getElementById("laporanPreviewPanel").style.display = "block";
  document.getElementById("laporanInfo").innerHTML =
    `<p style="color:#16a34a">Laporan siap: ${slips.length} slip gaji + lampiran untuk periode <b>${escapeHtml(periodeLabel)}</b>.</p>`;
  document.getElementById("laporanPreviewPanel").scrollIntoView({ behavior: "smooth" });
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
  document.getElementById("cfgJamPulangSabtu").value = c.jamPulangSabtu;
  document.getElementById("cfgToleransi").value = c.toleransiMenit;
  document.getElementById("cfgHariKerja").value = c.hariKerjaPerBulan;
  document.getElementById("cfgJamKerja").value = c.jamKerjaPerHari;
  document.getElementById("companyNameLabel").textContent = c.namaPerusahaan;

  __logoBase64 = c.logoUrl || null;
  document.getElementById("cfgLogo").value = "";
  if (c.logoUrl) {
    document.getElementById("cfgLogoPreview").src = c.logoUrl;
    document.getElementById("cfgLogoPreviewWrap").style.display = "flex";
  } else {
    document.getElementById("cfgLogoPreview").src = "";
    document.getElementById("cfgLogoPreviewWrap").style.display = "none";
  }
}

async function simpanPengaturan() {
  DB.config = {
    namaPerusahaan: document.getElementById("cfgNamaPerusahaan").value,
    alamat1: document.getElementById("cfgAlamat1").value,
    alamat2: document.getElementById("cfgAlamat2").value,
    alamat3: document.getElementById("cfgAlamat3").value,
    logoUrl: __logoBase64 || "",
    jamMasuk: document.getElementById("cfgJamMasuk").value,
    jamPulang: document.getElementById("cfgJamPulang").value,
    jamPulangSabtu: document.getElementById("cfgJamPulangSabtu").value,
    toleransiMenit: Number(document.getElementById("cfgToleransi").value),
    hariKerjaPerBulan: Number(document.getElementById("cfgHariKerja").value),
    jamKerjaPerHari: Number(document.getElementById("cfgJamKerja").value)
  };
  saveDB();
  document.getElementById("companyNameLabel").textContent = DB.config.namaPerusahaan;

  const btn = document.getElementById("btnSimpanPengaturan");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Menyimpan...";
  try {
    // Kirim langsung ke Firestore (bukan lewat debounce) supaya data pasti
    // sudah tersimpan di cloud sebelum user menutup/refresh halaman.
    if (typeof window.flushDBSave === "function") await window.flushDBSave();
    alert("Pengaturan disimpan.");
  } catch (err) {
    alert("Pengaturan disimpan secara lokal, tapi gagal sync ke cloud (cek koneksi internet). Coba simpan lagi saat online.");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
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
    sakit: "Surat Sakit", slip: "Slip Gaji", riwayat: "Riwayat Slip", laporan: "Laporan Periode", pengaturan: "Pengaturan"
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
      window.DB = DB;
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
  populateLaporanPeriodeSelect();
}

/* ---------------------------------------------------------
   EVENT BINDINGS
   (dipanggil oleh firebase-init.js setelah login berhasil,
   bukan langsung saat DOMContentLoaded, supaya tidak bind
   event 2x kalau user logout lalu login lagi)
--------------------------------------------------------- */
let __payrollAppStarted = false;
function startPayrollApp() {
  if (__payrollAppStarted) { renderAll(); return; }
  __payrollAppStarted = true;

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
    resetFormFotoSakit();
    document.getElementById("modalSakit").classList.add("active");
  });
  document.getElementById("btnBatalSakit").addEventListener("click", () => {
    document.getElementById("modalSakit").classList.remove("active");
    resetFormFotoSakit();
  });
  document.getElementById("btnSimpanSakit").addEventListener("click", simpanSuratSakit);
  document.getElementById("fSakitFoto").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("File harus berupa gambar/foto."); e.target.value = ""; return; }
    try {
      __sakitFotoBase64 = await compressImageToBase64(file);
      document.getElementById("fSakitFotoPreview").src = __sakitFotoBase64;
      document.getElementById("fSakitFotoPreviewWrap").style.display = "flex";
    } catch (err) {
      alert("Gagal memproses foto: " + err.message);
      resetFormFotoSakit();
    }
  });
  document.getElementById("btnHapusFotoSakit").addEventListener("click", resetFormFotoSakit);
  document.querySelector("#tblSakit tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "hapus-sakit") hapusSuratSakit(btn.dataset.id);
    if (btn.dataset.action === "lihat-foto-sakit") {
      const s = DB.suratSakit.find(x => x.id === btn.dataset.id);
      if (s && s.fotoUrl) {
        document.getElementById("imgLihatFotoBesar").src = s.fotoUrl;
        document.getElementById("modalLihatFoto").classList.add("active");
      }
    }
  });
  document.getElementById("btnTutupLihatFoto").addEventListener("click", () => {
    document.getElementById("modalLihatFoto").classList.remove("active");
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
  document.getElementById("autoCalcSummary").addEventListener("click", (e) => {
    const item = e.target.closest(".calc-item-clickable");
    if (!item) return;
    bukaDetailKehadiran(item.dataset.kategori);
  });
  document.getElementById("btnTutupDetailKehadiran").addEventListener("click", tutupDetailKehadiran);
  document.getElementById("modalDetailKehadiran").addEventListener("click", (e) => {
    if (e.target.id === "modalDetailKehadiran") tutupDetailKehadiran();
  });
  document.getElementById("btnPrintSlip").addEventListener("click", () => window.print());
  document.getElementById("btnSimpanSlip").addEventListener("click", simpanSlipKeRiwayat);

  // Riwayat
  document.querySelector("#tblRiwayat tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.action === "lihat-slip") lihatSlipRiwayat(btn.dataset.id);
  });

  // Laporan Periode
  document.getElementById("btnBuatLaporan").addEventListener("click", buatLaporanPeriode);
  document.getElementById("btnPrintLaporan").addEventListener("click", () => window.print());

  // Pengaturan
  document.getElementById("btnSimpanPengaturan").addEventListener("click", simpanPengaturan);
  document.getElementById("cfgLogo").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("File harus berupa gambar/foto."); e.target.value = ""; return; }
    try {
      __logoBase64 = await compressImageToBase64(file, 500, 0.85);
      document.getElementById("cfgLogoPreview").src = __logoBase64;
      document.getElementById("cfgLogoPreviewWrap").style.display = "flex";
    } catch (err) {
      alert("Gagal memproses logo: " + err.message);
      e.target.value = "";
    }
  });
  document.getElementById("btnHapusLogo").addEventListener("click", () => {
    __logoBase64 = null;
    document.getElementById("cfgLogo").value = "";
    document.getElementById("cfgLogoPreview").src = "";
    document.getElementById("cfgLogoPreviewWrap").style.display = "none";
  });

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
}
window.startPayrollApp = startPayrollApp;
