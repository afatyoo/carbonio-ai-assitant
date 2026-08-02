# Carbonio AI Agent Gateway

Gateway lokal antara microfrontend AI Assistant, AI Agent eksternal, dan Carbonio
Mailbox SOAP API.

## Menjalankan

```bash
/opt/homebrew/opt/node@22/bin/node src/server.js
```

Default: `http://127.0.0.1:8787`.

## Production di Carbonio

Artifact deployment berada di `deploy/`:

- `carbonio-ai-gateway.service` menjalankan gateway sebagai user khusus
  `carbonio-ai`.
- `nginx/upstream-carbonio-ai.conf` mendaftarkan upstream loopback.
- `nginx/backend-carbonio-ai.conf` mem-proxy `/api/ai/` dan mendukung streaming
  Server-Sent Events.

Runtime production menggunakan Node.js 22 dan data persisten berada di
`/var/lib/carbonio-ai-assistant/.runtime/`. Endpoint config, model, history,
dan chat memerlukan cookie sesi Carbonio yang valid.

Self-test database dan reliability dapat dijalankan dari working directory service:

```bash
npm run self-test
```

Untuk production, set `AI_DATABASE_URL` dan `AI_HISTORY_ENCRYPTION_KEY` (32 byte,
base64) agar conversation metadata tersimpan di PostgreSQL dan isi message dienkripsi
dengan AES-256-GCM. SQLite tetap tersedia hanya sebagai fallback development dan sumber
migrasi satu kali melalui `scripts/migrate-history-to-postgres.mjs`.

Pada paket server, jalankan migrasi production satu kali sebagai root:

```bash
/opt/carbonio-ai-assistant/bin/setup-postgres.sh
```

Backup dan restore tersedia di direktori yang sama. Restore wajib memakai argumen
`--yes` serta path absolut artifact backup.

Gateway menulis structured JSON log ke stdout/journald. Setiap request memiliki
`x-request-id` yang sama pada UI, response gateway, HTTP log, provider log, dan
Carbonio SOAP log.

## Carbonio documentation RAG

Gateway memiliki knowledge index lokal terkurasi di `knowledge/carbonio-email-api.json`.
Index awal berfokus pada panduan resmi Carbonio SOAP API untuk membaca email,
menyimpan draft, reply/forward, attachment, dan mengirim draft yang sudah
dikonfirmasi. Retrieval hanya aktif untuk pertanyaan dokumentasi atau compose;
permintaan mailbox biasa seperti ringkasan inbox tidak dicampur dengan context API.

Setiap chunk menyimpan judul, versi dataset, dan URL sumber resmi. Context yang
diambil dibatasi dan jawaban selalu ditambahkan daftar sumber resmi. Knowledge
ini tidak berisi atau mengindeks mailbox user.

Uji retrieval secara terautentikasi:

```text
GET /api/ai/knowledge/search?q=bagaimana%20membuat%20draft%20email
```

MVP ini menggunakan lexical retrieval tanpa dependency eksternal. Hybrid search
dan embedding `pgvector` tetap menjadi tahap berikutnya setelah migrasi PostgreSQL.

## Agent Tool Framework

Mailbox tools terdaftar melalui schema registry dengan risk level `READ`, `DRAFT`,
`WRITE`, atau `DESTRUCTIVE`. Runner memvalidasi input, memeriksa permission,
membatasi timeout serta ukuran result, dan menulis audit record tanpa menyimpan
isi field sensitif. Tool `WRITE` dan `DESTRUCTIVE` menggunakan confirmation token
sekali pakai yang terikat ke owner, nama tool, dan hash input. Idempotency result
disimpan per owner/tool/key untuk mencegah mutation ganda.

Audit pilot disimpan di `.runtime/audit.sqlite` dengan mode file `0600` dan dapat
diarahkan melalui `AI_AUDIT_DB_PATH`. Database ini akan ikut dimigrasikan ke
PostgreSQL pada fase production database.

Default timeout:

- AI provider: `75000` ms, dibatasi maksimum `90000` ms.
- Carbonio SOAP: `20000` ms, dibatasi maksimum `30000` ms.
- Daftar model: `15000` ms.

Provider request melakukan retry terkontrol untuk HTTP `429`, `502`, `503`, dan
network error dengan exponential backoff serta jitter. Seluruh percobaan tetap
berada dalam deadline provider.

## Menghubungkan AI Agent eksternal

```bash
AI_AGENT_URL=https://agent.example.com/chat \
AI_AGENT_API_KEY=your-secret \
/opt/homebrew/opt/node@22/bin/node src/server.js
```

Gateway mengirim:

```json
{
  "message": "Ringkas email belum dibaca hari ini",
  "context": {
    "toolResult": {
      "name": "list_unread_emails",
      "items": []
    }
  }
}
```

Agent eksternal dapat mengembalikan salah satu field berikut:

```json
{ "output_text": "Jawaban agent..." }
```

`message` dan `text` juga didukung sebagai alternatif `output_text`.

## Endpoint

- `GET /api/ai/health`
- `GET /api/ai/config`
- `PUT /api/ai/config`
- `GET /api/ai/models`
- `GET /api/ai/knowledge/search?q=...`
- `GET /api/ai/tools`
- `GET /api/ai/audit?limit=...`
- `GET /api/ai/conversations?cursor=...&q=...`
- `GET /api/ai/conversations/:id`
- `PUT /api/ai/conversations/:id`
- `PATCH /api/ai/conversations/:id`
- `DELETE /api/ai/conversations/:id`
- `POST /api/ai/conversations/:id/restore`
- `POST /api/ai/chat`

`POST /api/ai/chat` mengembalikan event `tool`, `message`, dan `done` dalam JSON.
Server-Sent Events tetap tersedia bagi client yang secara eksplisit mengirim
`Accept: text/event-stream`.

API key hanya berada di gateway. Cookie session Carbonio diteruskan oleh Shell
ke gateway dan digunakan hanya untuk SOAP request milik user aktif.
