# Carbonio User RAG Compatibility Matrix

| Source | Official API boundary | Indexing | Live validation | Status |
| --- | --- | --- | --- | --- |
| Mail and threads | `Search`, `GetMsg`, `GetConv` in `urn:zimbraMail` | Subject, participants, normalized body, attachment metadata | Exact `GetMsg` plus revision | Supported |
| Attachments | `GetMsg` MIME metadata and local `/service/content/get` | Safe text types up to 2 MB; other types metadata only | Exact parent `GetMsg` plus revision | Supported with documented type limits |
| Calendar | `Search` with appointment expansion and `GetAppointment` | Title, body, attendees, organizer, location, time | Exact `GetAppointment`, `rev`, and `ms` | Supported |
| Tasks | `Search` with `types=task` | Title, body, due date, status, completion | Current task search and revision | Supported |
| Personal contacts | `GetContacts` | Names, user-owned addresses, phones, company, notes | Current personal-contact list and revision | Supported |
| GAL | Live autocomplete only | Never indexed | Live Carbonio lookup | Deliberately excluded |
| Files and Docs | Official Files API compatibility probe required | None | None | Fail-visible unavailable |
| Chats and rooms | Official user-scoped Chats API and membership probe required | None | None | Fail-visible unavailable |

The implementation follows the official Carbonio Mail API reference. `Search` supports
message, contact, appointment, and task result types, offsets, bounded limits, and calendar
instance expansion. `GetMsg`, `GetAppointment`, and `GetContacts` are authenticated user
operations and do not require administrator authorization.
