# Bivrost

Bivrost adalah aplikasi web sederhana untuk membagikan folder media melalui browser. Program ini menampilkan isi folder berupa video dan gambar, menyediakan thumbnail, serta memudahkan navigasi folder dan pemutaran media langsung dari jaringan lokal.

## Tujuan Program

Program ini dibuat untuk:

- membagikan folder media agar bisa diakses dari browser
- menampilkan isi folder media dengan tampilan galeri
- memutar video langsung tanpa perlu memindahkan file
- melihat gambar langsung dari browser
- memudahkan akses koleksi media dari perangkat lain dalam satu jaringan

## Cara Pasang

### 1. Siapkan kebutuhan
Pastikan sudah terpasang:

- Node.js
- npm

### 2. Unduh dependensi
Jalankan perintah berikut di folder project:

```bash
npm install
```

## Cara Menjalankan

### Menjalankan aplikasi
Jalankan:

```bash
npm start
```

Perintah ini akan membangun project lalu menjalankan server.

### Menentukan folder media
Saat program berjalan, Anda akan diminta memasukkan path folder media yang ingin dibagikan.

Contoh:

```bash
D:\Media
```

Atau bisa langsung menjalankan dengan argumen folder:

```bash
npm start -- "D:\Media"
```

### Membuka dari browser
Setelah server aktif, buka browser ke alamat:

```text
http://localhost:5000
```

Jika ingin diakses dari perangkat lain dalam jaringan yang sama, gunakan alamat IP komputer yang menjalankan aplikasi, misalnya:

```text
http://192.168.1.10:5000
```

## Format Media yang Didukung

### Video

- .mp4
- .mkv
- .avi
- .mov
- .webm

### Gambar

- .jpg
- .jpeg
- .png
- .webp
- .gif
