# Carbonio AI Agent Gateway

Gateway lokal antara microfrontend AI Assistant, AI Agent eksternal, dan Carbonio
Mailbox SOAP API.

## Menjalankan

```bash
/opt/homebrew/opt/node@22/bin/node src/server.js
```

Default: `http://127.0.0.1:8787`.

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
- `POST /api/ai/chat`

`POST /api/ai/chat` mengembalikan Server-Sent Events: `tool`, `message`, `done`,
atau `error`.

API key hanya berada di gateway. Cookie session Carbonio diteruskan oleh Shell
ke gateway dan digunakan hanya untuk SOAP request milik user aktif.
