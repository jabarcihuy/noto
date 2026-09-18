# PRD — Noto

## 1. Product Identity

### Nama Aplikasi

**Noto**

> Nama ini adalah working name dan masih dapat diganti sebelum rilis.

### Tipe Produk

Personal knowledge capture and note management application.

### Platform Awal

Android.

### Teknologi Awal

* React Native
* Expo
* TypeScript
* SQLite
* Local filesystem

### Target Jangka Panjang

* Android
* iOS
* Web
* Desktop

Aplikasi harus dirancang agar pengembangan ke platform tersebut tidak mengharuskan core application ditulis ulang.

---

# 2. Product Overview

Noto adalah aplikasi untuk menangkap, menyimpan, menghubungkan, mengorganisasi, mencari, dan mengekspor informasi pribadi.

Informasi dapat berasal dari berbagai bentuk:

* catatan teks,
* gambar,
* voice note,
* URL,
* maupun konten yang dibagikan dari aplikasi lain.

Fokus utama aplikasi adalah membuat proses:

> **menyimpan sesuatu sekarang dan menemukannya kembali nanti**

menjadi sederhana.

Aplikasi bersifat **offline-first**. Fungsi inti tidak membutuhkan akun, server, atau koneksi internet.

---

# 3. Problem Statement

Informasi pribadi sering tersebar di banyak tempat.

Contohnya:

* ide ditulis di aplikasi notes,
* screenshot tersimpan di galeri,
* link dikirim ke chat sendiri,
* voice note berada di aplikasi messaging,
* referensi tersebar di browser,
* catatan kuliah berada di berbagai file.

Masalahnya bukan hanya bagaimana menyimpan informasi, tetapi bagaimana membuat informasi tersebut tetap berguna setelah disimpan.

Masalah utama yang ingin diselesaikan:

1. proses capture terlalu banyak langkah,
2. informasi lama sulit ditemukan,
3. catatan yang saling berkaitan tidak memiliki hubungan yang jelas,
4. pengguna dipaksa mengatur informasi sebelum sempat menyimpannya,
5. data terlalu bergantung pada aplikasi atau cloud tertentu.

---

# 4. Product Vision

Membangun tempat pribadi untuk menyimpan dan menghubungkan informasi yang:

* cepat digunakan,
* nyaman digunakan dalam kondisi offline,
* tidak memaksa pengguna melakukan organisasi sejak awal,
* mudah dicari,
* dan tetap dimiliki pengguna.

Prinsip sederhananya:

```text
Capture
   ↓
Keep
   ↓
Connect
   ↓
Find
   ↓
Own
```

---

# 5. Product Goals

## 5.1 Fast Capture

Pengguna dapat menyimpan informasi dengan cepat tanpa harus melalui setup yang panjang.

## 5.2 Flexible Organization

Pengguna dapat mengorganisasi informasi menggunakan:

* tags,
* notebooks,
* templates.

Organisasi tidak harus dilakukan pada saat capture.

## 5.3 Connected Notes

Pengguna dapat menghubungkan satu note dengan note lain menggunakan wikilink dan melihat backlinks.

## 5.4 Reliable Retrieval

Pengguna dapat menemukan informasi kembali menggunakan:

* search,
* filter,
* sorting,
* recent,
* saved search.

## 5.5 Data Ownership

Pengguna dapat mengeluarkan datanya dari aplikasi melalui export dan backup.

## 5.6 Offline-first

Fungsi inti aplikasi tetap dapat digunakan tanpa internet.

---

# 6. Product Principles

## 6.1 Capture First

Pengguna tidak diwajibkan menentukan struktur organisasi sebelum menyimpan informasi.

Contoh:

```text
Capture
   ↓
Save
```

kemudian:

```text
Organize later
```

## 6.2 Offline by Default

Data utama berada di perangkat.

Internet hanya digunakan ketika memang diperlukan.

## 6.3 Content First

Isi note merupakan bagian utama.

Metadata harus membantu, bukan mengalahkan isi.

## 6.4 Relationships Matter

Note dapat memiliki hubungan dengan note lain.

## 6.5 User Owns the Data

Pengguna dapat mengekspor dan memindahkan datanya.

## 6.6 Simple Before Powerful

MVP tidak boleh menjadi terlalu kompleks hanya untuk mengakomodasi fitur masa depan.

---

# 7. Target User

Target utama adalah pengguna individual yang sering menyimpan berbagai jenis informasi.

Contoh penggunaan:

### Student

* materi kuliah,
* ide tugas,
* screenshot,
* referensi,
* link,
* voice note.

### Developer

* command,
* dokumentasi,
* debugging notes,
* code reference,
* project ideas.

### General User

* ide pribadi,
* artikel,
* referensi,
* foto,
* catatan singkat.

Pengguna tidak diasumsikan memahami metode knowledge management seperti Zettelkasten atau PKM.

Aplikasi harus tetap mudah digunakan tanpa pengetahuan tersebut.

---

# 8. Main Feature Groups

Aplikasi memiliki empat kelompok fitur utama.

## 8.1 Quick Capture

* Text Capture
* Image Capture
* Voice Note
* URL Capture
* Share Input

## 8.2 Linking & Organization

* Bidirectional Linking
* Backlinks
* Tags
* Notebook
* Templates

## 8.3 Search & Retrieval

* Full-text Search
* Filters
* Saved Search / Smart Collection
* Sorting
* Recent

## 8.4 Export & Data Ownership

* Markdown Export
* Full Vault Export
* Markdown Import
* Obsidian Import
* Local File Sync / Backup

---

# 9. Quick Capture

Quick Capture merupakan jalur utama untuk memasukkan informasi.

Pengguna tidak perlu menentukan notebook atau tag sebelum menyimpan.

---

## 9.1 Text Capture

Pengguna dapat membuat note teks.

Data minimal:

```text
Title
Content
```

Title dapat kosong ketika capture awal.

Note harus dapat langsung disimpan secara lokal.

---

## 9.2 Image Capture

Pengguna dapat memasukkan gambar melalui:

* camera,
* gallery.

Gambar menjadi attachment dari sebuah note.

Binary file disimpan sebagai file lokal.

---

## 9.3 Voice Note

Pengguna dapat:

1. memulai recording,
2. menghentikan recording,
3. memutar hasil recording,
4. menyimpan recording,
5. menghapus recording.

Transcription bukan requirement wajib MVP.

---

## 9.4 URL Capture

Pengguna dapat menyimpan URL.

Aplikasi dapat mencoba mengambil:

* title,
* description,
* domain,
* preview image.

Metadata URL bersifat tambahan.

Jika metadata gagal diambil, URL tetap harus tersimpan.

Contoh:

```text
URL saved
Metadata unavailable
```

---

## 9.5 Share Input

Aplikasi dapat menerima content dari aplikasi lain menggunakan mekanisme share platform.

Contoh sumber:

* browser,
* WhatsApp,
* Telegram,
* file manager,
* aplikasi lain.

Payload dapat berupa:

* text,
* URL,
* image,
* file.

Konten yang diterima kemudian diarahkan ke alur capture yang sesuai.

---

# 10. Linking & Organization

## 10.1 Bidirectional Linking

Format dasar:

```text
[[Nama Catatan]]
```

Contoh:

```text
Belajar Java berkaitan dengan [[Java OOP]].
```

Ketika target note ditemukan, hubungan disimpan antara note sumber dan note tujuan.

Hubungan tidak boleh bergantung pada title sebagai identity.

---

## 10.2 Unresolved Link

Link tetap dapat dibuat walaupun target note belum ada.

Contoh:

```text
[[Operating Systems]]
```

Note tujuan dapat dibuat kemudian.

Unresolved link bukan error.

---

## 10.3 Rename Safety

Jika title note berubah, link yang sudah terhubung tetap harus mengarah ke note yang sama.

Contoh:

```text
Java Basics
     ↓
Note ID X

rename

Java Fundamental
     ↓
Note ID X
```

Relationship tetap menggunakan Note ID X.

---

## 10.4 Backlinks

Pada note detail, pengguna dapat melihat note lain yang mereferensikan note tersebut.

Contoh:

```text
Java OOP

Backlinks
─────────
Java Basics
Mobile Programming
Catatan UAS
```

Backlinks tidak menjadi data duplikat.

Backlinks merupakan hasil dari relationship yang sudah tersimpan.

---

## 10.5 Tags

Satu note dapat memiliki banyak tag.

Contoh:

```text
#java
#college
#project
```

Tag digunakan untuk:

* classification,
* filtering,
* retrieval.

Perbedaan capitalization tidak boleh menghasilkan duplicate logical tag tanpa alasan.

---

## 10.6 Notebook

Notebook merupakan pengelompokan tingkat atas.

Contoh:

```text
Kuliah
Project
Referensi
Pribadi
```

Satu note dapat:

* berada pada satu notebook,
* atau tidak memiliki notebook.

Notebook dan tag memiliki fungsi yang berbeda.

Notebook merupakan struktur utama, sedangkan tag lebih fleksibel untuk klasifikasi.

Menghapus notebook tidak boleh otomatis menghapus note.

---

## 10.7 Templates

Template menyediakan struktur awal pembuatan note.

Template bawaan:

* Fleeting Note
* Permanent Note
* Idea
* Meeting Note
* Literature Note

Template hanya digunakan sebagai starting point.

Setelah note dibuat, note tidak tergantung pada template tersebut.

---

# 11. Search & Retrieval

Search merupakan bagian inti aplikasi.

---

## 11.1 Full-text Search

Search minimal mencakup:

* title,
* content.

Search harus dapat digunakan tanpa internet.

MVP tidak membutuhkan semantic search.

---

## 11.2 Filters

Filter minimal:

* tag,
* notebook,
* date,
* capture type.

Filter dapat dikombinasikan.

Contoh:

```text
Query: Java
Tag: programming
Notebook: Kuliah
Type: text
```

---

## 11.3 Sorting

Pilihan sorting:

* Recently Updated
* Recently Opened
* Newest
* Oldest

---

## 11.4 Recent

Recent digunakan untuk menemukan note yang baru:

* dibuat,
* diedit,
* dibuka.

Recent bukan recommendation system.

---

## 11.5 Saved Search / Smart Collection

Pengguna dapat menyimpan search.

Contoh:

```text
Programming Notes
```

dengan aturan:

```text
Tag = programming
```

Ketika collection dibuka, hasilnya harus dihitung berdasarkan data terbaru.

Saved Search tidak menyimpan copy dari hasil pencarian.

---

# 12. Export & Data Ownership

## 12.1 Markdown Export

Satu note dapat diekspor menjadi file:

```text
.md
```

Informasi penting seperti:

* title,
* content,
* tags,
* wikilink

harus dipertahankan sejauh format memungkinkan.

---

## 12.2 Full Vault Export

Pengguna dapat mengekspor seluruh data.

Contoh struktur:

```text
vault/
├── notes/
├── attachments/
└── manifest.json
```

Vault dapat dikemas menjadi:

```text
vault.zip
```

Format export harus dapat digunakan untuk backup dan restore.

---

## 12.3 Markdown Import

Pengguna dapat mengimpor:

* satu file Markdown,
* folder Markdown.

Content harus dipertahankan semaksimal mungkin.

---

## 12.4 Obsidian Import

Target kompatibilitas dasar:

* Markdown,
* wikilink,
* tags,
* attachments.

Syntax Obsidian yang belum didukung tidak boleh otomatis menghapus informasi yang masih dapat dipertahankan sebagai Markdown.

---

## 12.5 Local File Sync / Backup

Folder lokal dapat digunakan sebagai:

* backup destination,
* restore source,
* dasar sinkronisasi di masa depan.

MVP tidak harus memiliki conflict resolution yang kompleks.

Jika conflict tidak dapat diselesaikan secara aman, aplikasi tidak boleh menimpa data secara diam-diam.

---

# 13. Data Model Overview

Data terstruktur yang dibutuhkan:

```text
Note
Notebook
Tag
Note-Tag Relationship
Note-Link Relationship
Attachment
Template
Saved Search
Application Metadata
```

File binary:

```text
Image
Audio
Other Attachment
```

Database menyimpan metadata.

Filesystem menyimpan binary file.

Detail schema akan dibuat pada `DATABASE.md`.

---

# 14. Offline Requirements

Tanpa internet, pengguna tetap harus dapat:

* membuat note,
* membaca note,
* mengedit note,
* menghapus note,
* menambahkan tag,
* memindahkan notebook,
* membuat wikilink,
* melihat backlinks,
* melakukan search,
* menggunakan filter,
* melakukan sorting,
* melihat recent,
* menggunakan saved search,
* melakukan local import,
* melakukan Markdown export,
* melakukan full vault export.

Network hanya menjadi dependency untuk fungsi tambahan seperti metadata URL dan fitur masa depan.

---

# 15. Privacy Requirements

MVP tidak membutuhkan:

* login,
* account,
* user profile,
* backend wajib.

Data pengguna disimpan secara lokal secara default.

Aplikasi tidak boleh mengirim isi note ke external service tanpa feature yang secara eksplisit membutuhkan hal tersebut.

Core application tetap harus berfungsi tanpa server.

---

# 16. Initial UX Structure

Struktur utama aplikasi:

```text
Home
Search
Notebooks
Settings
```

Quick Capture menjadi action utama.

Home berfokus pada:

```text
Quick Capture
+
Recent Notes
```

Home bukan dashboard statistik.

---

# 17. User Experience Principles

Aplikasi harus membuat pengguna memahami:

* apa yang sedang dilakukan,
* apakah data sudah tersimpan,
* apa yang dapat dilakukan berikutnya,
* dan apa yang terjadi ketika suatu operasi gagal.

### Capture

Harus cepat.

### Note

Editor harus fokus pada content.

### Search

Harus mudah diakses.

### Organization

Tidak boleh menghambat capture.

### Data

Import dan export harus mudah dipahami.

---

# 18. Error Handling Requirements

Error harus dibedakan berdasarkan sumber masalah.

Contoh URL:

```text
The link was saved, but its preview could not be loaded.
```

Artinya data utama aman walaupun metadata gagal.

Contoh attachment:

```text
This attachment is no longer available.
```

Note tetap dapat dibuka.

Error database atau filesystem harus ditangani tanpa menampilkan pesan teknis mentah kepada pengguna.

---

# 19. Performance Expectations

Target pengujian awal:

```text
1,000 notes
10,000 notes
50,000 notes
```

Aplikasi harus tetap dapat digunakan dengan jumlah data tersebut.

Search dan list tidak boleh memuat seluruh vault ke memory tanpa alasan.

Optimasi lebih lanjut dilakukan berdasarkan hasil pengujian nyata.

---

# 20. Cross-platform Requirements

Android adalah platform pertama.

Namun core application tidak boleh bergantung pada Android.

Logic yang seharusnya dapat digunakan kembali:

* note rules,
* linking,
* backlinks,
* tags,
* search,
* filtering,
* import,
* export.

Kemampuan platform-specific dapat berbeda:

* camera,
* microphone,
* filesystem,
* file picker,
* share integration,
* notification.

Detail pembagian tersebut akan dijelaskan di `ARCHITECTURE.md`.

---

# 21. Technical Direction

Teknologi awal:

```text
React Native
Expo
TypeScript
SQLite
Local Filesystem
```

Pemilihan library tambahan harus berdasarkan kebutuhan nyata.

AI agent tidak boleh menambahkan dependency hanya karena library tersebut populer.

AI agent juga tidak boleh menambahkan backend hanya karena dianggap lebih mudah untuk implementasi.

---

# 22. MVP Scope

## Must Have

### Quick Capture

* Text
* Image
* Voice
* URL
* Share Input

### Linking & Organization

* Wikilink
* Backlinks
* Tags
* Notebooks
* Templates

### Search & Retrieval

* Full-text Search
* Filters
* Sorting
* Recent
* Saved Search

### Data Ownership

* Markdown Export
* Full Vault Export
* Markdown Import
* Basic Obsidian Import

### Core

* Offline operation
* Local database
* Local attachment storage

---

# 23. Explicitly Out of Scope for MVP

Fitur berikut belum dibangun:

```text
AI Assistant
Semantic Search
OCR
Automatic Transcription
Cloud Sync
User Account
Authentication
Collaboration
Real-time Sync
Plugin System
Social Features
```

Tidak boleh ada feature creep ke area tersebut selama MVP belum stabil.

---

# 24. Future Direction

Setelah MVP stabil, produk dapat berkembang ke tiga area.

## Platform

* iOS
* Web
* Desktop

## Data

* encrypted backup,
* cloud synchronization,
* conflict resolution.

## Intelligence

* OCR,
* transcription,
* semantic search,
* automatic tagging,
* summarization,
* AI-assisted organization.

Fitur masa depan tidak boleh menghilangkan kemampuan user untuk menggunakan data secara lokal.

AI juga tidak boleh menjadi satu-satunya cara untuk mengakses atau mengelola data.

---

# 25. Success Criteria

MVP dianggap berhasil ketika pengguna dapat menyelesaikan alur:

```text
Capture
   ↓
Save
   ↓
Organize
   ↓
Connect
   ↓
Search
   ↓
Export
   ↓
Import
```

tanpa membutuhkan akun atau koneksi internet untuk fungsi inti.

Keberhasilan produk tidak ditentukan oleh banyaknya fitur, tetapi oleh:

* kecepatan capture,
* kemudahan menemukan kembali informasi,
* keandalan penyimpanan,
* dan kemampuan pengguna memiliki datanya sendiri.

---

# 26. Documentation Strategy

PRD ini merupakan **source of truth tingkat produk**.

AI agent nantinya harus menurunkan dokumen berikut dari PRD:

```text
docs/
├── PRD.md
├── ARCHITECTURE.md
├── DATABASE.md
├── FEATURES.md
├── UX_FLOW.md
├── DESIGN_SYSTEM.md
└── ROADMAP.md

AGENTS.md
```

Tanggung jawab masing-masing:

### ARCHITECTURE.md

Bagaimana aplikasi dibagi secara teknis.

### DATABASE.md

Bagaimana data disimpan dan berelasi.

### FEATURES.md

Bagaimana setiap feature bekerja secara rinci.

### UX_FLOW.md

Bagaimana pengguna berpindah dan berinteraksi dengan aplikasi.

### DESIGN_SYSTEM.md

Aturan visual dan component design.

### ROADMAP.md

Urutan dan batas implementation phase.

### AGENTS.md

Aturan AI agent saat membaca repository, membuat perubahan, melakukan testing, dan melaporkan hasil.

---

# 27. Rules for Derived Documents

Dokumen turunan tidak boleh mengubah requirement produk secara diam-diam.

Contoh:

Jika PRD menyatakan:

```text
Core application works offline
```

maka architecture tidak boleh membuat backend sebagai dependency wajib.

Jika ditemukan keterbatasan teknis yang benar-benar membutuhkan perubahan requirement:

```text
Identify problem
      ↓
Explain impact
      ↓
Propose change
      ↓
Update PRD
      ↓
Update affected documents
```

Jangan mengubah product behavior tanpa dokumentasi.

---

# 28. Final Product Definition

Noto adalah aplikasi personal knowledge capture yang berfokus pada:

```text
Fast Capture
      +
Simple Organization
      +
Connected Notes
      +
Reliable Retrieval
      +
Data Ownership
      +
Offline-first
```

Aplikasi tidak bertujuan memiliki fitur paling banyak.

Aplikasi bertujuan menjadi tempat yang sederhana dan dapat dipercaya untuk menyimpan informasi pribadi dan menemukannya kembali ketika dibutuhkan.
