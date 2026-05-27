# Product Requirement Document (PRD)
## Project: Bivrost (MVP v1.1)

---

## 1. Project Overview & Objectives
**Bivrost** adalah aplikasi web berbasis lokal (*self-hosted*) yang berjalan di laptop untuk membagikan (*serve*) file video dan gambar ke perangkat lain (HP) dalam satu jaringan Wi-Fi yang sama. 

### Tujuan Utama:
* **Zero-Installation Client:** Pengguna HP dapat langsung mengakses dan memutar media melalui web browser bawaan tanpa perlu menginstal aplikasi tambahan.
* **Instant Playback:** Bisa langsung memutar video berukuran besar tanpa perlu mengunduh (*download*) file secara utuh terlebih dahulu di HP.
* **Privacy & Efficiency:** Laptop harus memilih folder tertentu terlebih dahulu sebelum server aktif, guna membatasi akses berkas di hardisk.

---

## 2. User Persona & Scope
* **User:** Pemilik laptop yang ingin menikmati konten video/foto di HP mereka secara praktis di area jangkauan Wi-Fi rumah/kantor.
* **Scope:** Terbatas pada jaringan lokal (LAN/Wi-Fi). Tidak mencakup akses *remote* di luar jaringan rumah (bukan untuk internet publik).

---

## 3. User Workflow (Alur Pengguna)
1. **Inisiasi di Laptop:** Pengguna menjalankan aplikasi pertama kali di laptop -> Muncul antarmuka pemilihan folder (Folder Picker) -> Pengguna memilih folder kerja -> Server aktif dan menampilkan alamat IP lokal (contoh: `http://192.168.1.15:5000`).
2. **Akses dari HP:** Pengguna membuka browser HP -> Memasukkan alamat IP lokal tersebut -> Masuk ke Halaman Utama aplikasi.
3. **Eksplorasi:** Pengguna menjelajahi struktur folder yang rapi dengan tampilan grid dan visual thumbnail otomatis.
4. **Playback:** Pengguna mengetuk file media:
   * **Gambar:** Membuka tampilan Lightbox pop-up.
   * **Video:** Masuk ke halaman video player ala YouTube (bisa *stream*, *seek* durasi, dan klik *Next*/*Previous*).

---

## 4. Functional Requirements (Kebutuhan Fitur MVP)

### 4.1. Manajemen Direktori & Folder Selection (Sisi Laptop)
* **ID:** `FR-01`
* **Deskripsi:** Saat aplikasi dijalankan di laptop, sistem wajib meminta pengguna memilih folder target yang akan di-share menggunakan Native Folder Chooser UI atau input path.
* **Aturan Bisnis:** Aplikasi hanya boleh membaca dan menampilkan isi dari folder terpilih tersebut beserta sub-foldernya. Seluruh area *file system* hardisk lainnya harus diisolasi dari jaringan demi keamanan.

### 4.2. Penyaringan Format Berkas (Strict Whitelisting)
* **ID:** `FR-02`
* **Deskripsi:** Sistem harus memindai isi folder dan hanya menampilkan berkas yang termasuk dalam format video dan gambar yang didukung. Berkas dengan format lain (seperti `.pdf`, `.zip`, `.exe`, `.txt`) harus disembunyikan.
* **Format Video Didukung:** `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`
* **Format Gambar Didukung:** `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`

### 4.3. Pembuatan Thumbnail Otomatis
* **ID:** `FR-03`
* **Deskripsi:** Tampilan utama berupa folder grid yang dilengkapi thumbnail sebagai indikator visual isi file.
* **Mekanisme Video:** Server di laptop mengekstrak satu bingkai (*frame*) secara otomatis dari file video (direkomendasikan pada detik ke-5) menggunakan *tool* seperti FFmpeg untuk dijadikan cover thumbnail.
* **Mekanisme Gambar:** Server mengirimkan versi gambar asli atau versi kompresi ringan untuk menghemat *bandwidth* pemuatan halaman.

### 4.4. Instan Video Streaming (YouTube-like UI)
* **ID:** `FR-04`
* **Deskripsi:** Pemutar video di sisi HP harus responsif dan memiliki kontrol intuitif.
* **HTTP Range Requests:** Server wajib mendukung pengiriman data berbasis *chunk* (parsial) agar video berukuran bergiga-giga bisa langsung diputar seketika dan mendukung lompat durasi (*seeking*) tanpa *buffering* lama.
* **YouTube Control Style:**
  * Tombol Play / Pause.
  * Timeline Slider / Seek bar untuk maju-mundur video.
  * **Tombol Next & Previous:** Mengizinkan pengguna berpindah ke video berikutnya atau sebelumnya dalam satu sub-folder yang sama secara alfabetis.
  * Opsi Full Screen dan volume control.

---

## 5. Non-Functional Requirements (Kebutuhan Non-Fungsional)

### 5.1. Kompatibilitas Browser (Client Side)
* Frontend wajib menggunakan elemen standar HTML5 `<video>` atau library player berbasis web (seperti Plyr / Video.js).
* Harus berjalan mulus di Google Chrome (Android) dan Apple Safari (iOS).

### 5.2. On-The-Fly Transcoding (Penanganan Codec)
* Karena beberapa browser HP tidak mendukung kontainer tertentu seperti `.mkv` atau codec audio seperti `AC3`/`DTS`, server di laptop disarankan memiliki *fallback mechanism* menggunakan FFmpeg untuk melakukan konversi format/audio secara *live* (*on-the-fly transcoding*) ke format ramah browser (`H.264` / `AAC`) saat video diputar.

### 5.3. Performa & Desain Antarmuka
* Antarmuka web harus didesain *Mobile-First* (responsif penuh pada layar HP).
* Menggunakan teknik *Lazy Loading* untuk pemuatan thumbnail agar tidak membebani memori browser HP saat membuka folder yang berisi ratusan file.

---

## 6. Matriks Prioritas Fitur (MVP)

| ID | Fitur | Deskripsi Ringkas | Prioritas |
| :--- | :--- | :--- | :--- |
| **FR-01** | Folder Chooser UI | Pemilihan direktori kerja di awal buka aplikasi laptop. | High (Mandatory) |
| **FR-02** | Strict Format Filter | Hanya menampilkan media video & foto, sembunyikan file lain. | High (Mandatory) |
| **FR-03** | Thumbnail Engine | Ekstraksi otomatis *frame* video sebagai cover. | High (Mandatory) |
| **FR-04** | Chunked Video Stream | Dukungan HTTP Range Request untuk *stream* instan video besar.| High (Mandatory) |
| **FR-05** | YouTube Controls | Tombol Next/Previous sekuensial dalam satu direktori. | High (Mandatory) |
