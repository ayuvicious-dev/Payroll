/* =========================================================
   FIREBASE INIT — Auth (email/password) + Firestore sync
   Semua data tetap dibaca/ditulis via variabel `DB` yang sama
   di app.js (localStorage tetap dipakai sebagai cache offline).
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBL6PHLq22mIoty_aAW8Dm7b2TlNSUqnuM",
  authDomain: "mypayroll-67fab.firebaseapp.com",
  projectId: "mypayroll-67fab",
  storageBucket: "mypayroll-67fab.firebasestorage.app",
  messagingSenderId: "787755891729",
  appId: "1:787755891729:web:2eda8f9bcff687674105b0"
};

// Semua device/user yang login berbagi SATU dokumen data penggajian yang sama
// (project Firebase ini khusus untuk aplikasi payroll, terpisah dari project lain).
const FIRESTORE_COLLECTION = "payrollApp";
const FIRESTORE_DOC_ID = "sharedData";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

enableIndexedDbPersistence(db).catch(() => {
  /* diabaikan: gagal aktifkan persistence (mis. banyak tab terbuka) — app tetap jalan */
});

let unsubscribeSnapshot = null;
let saveTimer = null;
let suppressNextAutoSave = false;

const el = (id) => document.getElementById(id);

function showLogin(message) {
  el("loginOverlay").style.display = "flex";
  el("appRoot").style.display = "none";
  setLoginBusy(false);
  if (message) setLoginMessage(message, "error");
}

function showApp() {
  el("loginOverlay").style.display = "none";
  el("appRoot").style.display = "";
}

function setLoginBusy(busy) {
  el("btnLogin").disabled = busy;
  el("btnLogin").textContent = busy ? "Memuat..." : "Masuk";
}

function setLoginMessage(msg, type) {
  const box = el("loginMessage");
  box.textContent = msg || "";
  box.style.display = msg ? "block" : "none";
  box.className = "login-message " + (type === "success" ? "success" : "error");
}

function pesanErrorAuth(code) {
  switch (code) {
    case "auth/invalid-email": return "Format email tidak valid.";
    case "auth/user-disabled": return "Akun ini dinonaktifkan. Hubungi admin.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential": return "Email atau password salah.";
    case "auth/too-many-requests": return "Terlalu banyak percobaan gagal. Coba lagi beberapa saat lagi.";
    case "auth/network-request-failed": return "Tidak ada koneksi internet.";
    default: return "Gagal masuk (" + code + ")";
  }
}

function doLogin() {
  const email = el("loginEmail").value.trim();
  const password = el("loginPassword").value;
  if (!email || !password) { setLoginMessage("Email dan password wajib diisi.", "error"); return; }
  setLoginBusy(true);
  setLoginMessage("");
  signInWithEmailAndPassword(auth, email, password).catch((err) => {
    setLoginBusy(false);
    setLoginMessage(pesanErrorAuth(err.code), "error");
  });
}

function doResetPassword() {
  const email = el("loginEmail").value.trim();
  if (!email) { setLoginMessage("Isi kolom email dulu, lalu klik 'Lupa password?' lagi.", "error"); return; }
  sendPasswordResetEmail(auth, email)
    .then(() => setLoginMessage("Link reset password sudah dikirim ke " + email, "success"))
    .catch((err) => setLoginMessage(pesanErrorAuth(err.code), "error"));
}

function doLogout() {
  if (!confirm("Keluar dari aplikasi?")) return;
  signOut(auth);
}

el("btnLogin").addEventListener("click", doLogin);
el("btnResetPassword").addEventListener("click", doResetPassword);
["loginEmail", "loginPassword"].forEach((id) => {
  el(id).addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
});
el("btnLogout").addEventListener("click", doLogout);

onAuthStateChanged(auth, (user) => {
  if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }

  if (!user) {
    showLogin();
    return;
  }

  el("loginEmailLabel") && (el("loginEmailLabel").textContent = user.email);
  el("userEmailLabel") && (el("userEmailLabel").textContent = user.email);
  setLoginBusy(true);

  const ref = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC_ID);

  unsubscribeSnapshot = onSnapshot(
    ref,
    (snap) => {
      let perluPerbaikanBalik = false;
      if (snap.exists()) {
        const data = snap.data();
        suppressNextAutoSave = true; // ini data DARI server, jangan ditulis balik

        // Gabungkan daftar "tombstone" slip yang sudah dihapus (lokal + server)
        // supaya slip yang sudah dihapus tidak bisa muncul lagi walau data
        // yang datang dari server masih membawanya (mis. tertimpa oleh
        // perangkat/tab lain yang belum sempat sinkron saat penghapusan terjadi).
        const deletedLocal = window.DB.deletedSlipIds || [];
        const deletedRemote = data.deletedSlipIds || [];
        const deletedGabungan = Array.from(new Set([...deletedLocal, ...deletedRemote]));

        const riwayatRemote = data.riwayatSlip || [];
        const riwayatBersih = riwayatRemote.filter((s) => !deletedGabungan.includes(s.id));
        perluPerbaikanBalik = riwayatBersih.length !== riwayatRemote.length;

        Object.assign(window.DB, {
          config: data.config || window.DB.config,
          personalia: data.personalia || [],
          suratSakit: data.suratSakit || [],
          riwayatSlip: riwayatBersih,
          kehadiranImport: data.kehadiranImport || {},
          deletedSlipIds: deletedGabungan
        });
        localStorage.setItem("payrollAppData_v1", JSON.stringify(window.DB));
      }
      setLoginBusy(false);
      showApp();
      window.startPayrollApp();
      updateSyncIndicator("online");

      if (perluPerbaikanBalik) {
        // Data di server masih membawa slip yang sudah dihapus — kirim balik
        // versi yang sudah bersih supaya semua perangkat konsisten.
        suppressNextAutoSave = false;
        setTimeout(() => { if (window.flushDBSave) window.flushDBSave(); }, 0);
      }
    },
    (err) => {
      console.error("Firestore sync error:", err);
      setLoginBusy(false);
      showApp();
      window.startPayrollApp(); // tetap jalan pakai data localStorage kalau offline
      updateSyncIndicator("offline");
    }
  );
});

// Dipanggil oleh app.js setiap kali saveDB() jalan (lihat hook window.onDBSaved)
window.onDBSaved = function () {
  if (suppressNextAutoSave) { suppressNextAutoSave = false; return; }
  if (!auth.currentUser) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    doFirestoreSave();
  }, 500);
};

function doFirestoreSave() {
  if (!auth.currentUser) return Promise.resolve();
  const ref = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC_ID);
  return setDoc(ref, { ...window.DB, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.email })
    .then(() => updateSyncIndicator("online"))
    .catch((err) => {
      console.error("Gagal sync ke Firestore:", err);
      updateSyncIndicator("offline");
      throw err;
    });
}

// Dipanggil dari app.js untuk aksi kritikal (mis. Simpan Pengaturan) supaya
// data langsung terkirim ke Firestore TANPA menunggu debounce 500ms —
// mencegah data lama menimpa balik data baru jika user refresh terlalu cepat.
window.flushDBSave = function () {
  clearTimeout(saveTimer);
  return doFirestoreSave();
};

// Dipanggil dari tombol sinkronisasi manual di top-bar (app.js). Mengembalikan
// { ok: true } jika berhasil, atau { ok: false, reason } jika gagal/tidak login.
window.manualSync = async function () {
  if (!auth.currentUser) return { ok: false, reason: "offline" };
  try {
    await doFirestoreSave();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "error" };
  }
};

function updateSyncIndicator(status) {
  const waktu = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const teks = status === "online" ? ("☁ Tersinkron " + waktu) : "⚠ Offline (data lokal)";
  ["syncIndicator", "syncIndicatorTopbar"].forEach((id) => {
    const indicator = el(id);
    if (!indicator) return;
    indicator.textContent = teks;
    indicator.className = "sync-indicator " + status;
  });
}

window.addEventListener("online", () => updateSyncIndicator("online"));
window.addEventListener("offline", () => updateSyncIndicator("offline"));
