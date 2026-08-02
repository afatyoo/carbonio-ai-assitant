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

Gateway menulis structured JSON log ke stdout/journald. Setiap request memiliki
`x-request-id` yang sama pada UI, response gateway, HTTP log, provider log, dan
Carbonio SOAP log.

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
