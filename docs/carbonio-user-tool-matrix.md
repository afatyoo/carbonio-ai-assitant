# Carbonio User Tool Matrix

## Scope

This matrix defines what “full Carbonio tools” means for Carbonio AI Assistant. The scope is
every supported activity that a normal authenticated user can perform in their own account.
It does not include Carbonio administration.

Every tool uses the active user's Carbonio session. The gateway does not use an admin token,
does not impersonate another account, and does not access Carbonio internal databases.

## Safety model

| Risk | Behavior |
| --- | --- |
| `READ` | Bounded read that does not mutate Carbonio data |
| `DRAFT` | Creates or changes a draft only after an exact preview and confirmation |
| `WRITE` | Revalidates the exact target, shows a preview, and executes once after confirmation |
| `DESTRUCTIVE` | Uses a stronger warning, exact-target revalidation, one-time confirmation, and audit record |

## Active tools

| Domain | Tool | Risk | Carbonio API |
| --- | --- | --- | --- |
| Mail | `search_emails`, `list_unread_emails` | `READ` | `Search` |
| Mail | `get_email`, `list_attachments` | `READ` | `GetMsg` |
| Mail | `get_email_thread` | `READ` | `GetConv` |
| Mail | `create_email_draft`, `update_email_draft`, `forward_as_draft` | `DRAFT` | `SaveDraft` |
| Mail | `send_email` | `WRITE` | `SendMsg` |
| Mail | `mark_as_read`, `mark_as_unread`, `flag_email`, `unflag_email` | `WRITE` | `GetMsg`, `MsgAction` |
| Mail | `mark_as_spam`, `mark_as_not_spam`, `add_tag`, `remove_tag`, `move_email` | `WRITE` | `GetMsg`, `MsgAction` |
| Mail | `delete_email` | `DESTRUCTIVE` | `GetMsg`, `MsgAction` |
| Folders | `list_folders` | `READ` | `GetFolder` |
| Folders | `create_folder`, `rename_folder`, `move_folder` | `WRITE` | `CreateFolder`, `FolderAction` |
| Folders | `delete_folder`, `empty_trash` | `DESTRUCTIVE` | `FolderAction` |
| Tags | `list_tags` | `READ` | `GetTag` |
| Tags | `create_tag`, `rename_tag` | `WRITE` | `CreateTag`, `TagAction` |
| Tags | `delete_tag` | `DESTRUCTIVE` | `TagAction` |
| Calendar | `get_appointment`, `search_appointments` | `READ` | `GetAppointment`, `Search` |
| Calendar | `check_free_busy`, `propose_meeting_slots` | `READ` | `GetFreeBusy` |
| Calendar | `create_calendar_draft`, `update_appointment` | `DRAFT` | `SetAppointment`, `GetAppointment`, `ModifyAppointment` |
| Calendar | `create_appointment`, `send_meeting_invitation` | `WRITE` | `CreateAppointment`, `GetAppointment`, `ModifyAppointment` |
| Calendar | `cancel_appointment` | `DESTRUCTIVE` | `GetAppointment`, `CancelAppointment` |
| Contacts | `search_contacts`, `resolve_attendees` | `READ` | `AutoComplete` |

## Implementation train

### Mail organization

- Folder listing, creation, rename, move, recoverable deletion to Trash, and permanent Trash
  emptying are implemented at the gateway boundary
- Tag listing, creation, rename, deletion, add, and remove are implemented at the gateway boundary
- Mark unread, flag, unflag, archive, spam, not spam, restore, and attachment removal

### Tasks

- Search and exact retrieval
- Create, update, complete, reopen, and delete remain compatibility-gated on the target server
  because its SOAP dispatcher returns `service.UNKNOWN_DOCUMENT` for the documented task commands
- Compatibility fallback for servers that store Tasks as appointment-backed records in
  standard Tasks folder ID 15, including exact retrieval through `GetAppointment` when
  `GetTask` is unavailable

### Personal contacts

- List and exact retrieval
- Create, update, move, tag, and delete
- Contact groups remain subject to exact server compatibility tests

### Calendar

- Calendar listing, creation, rename, and deletion
- Invitation accept, tentative, decline, and appointment forwarding
- Alarm dismiss and snooze
- Existing meeting creation, update, invitation, cancellation, free-busy, and slot proposal
  remain part of the same confirmation framework

### Sharing and personal preferences

- User-owned share listing, grant, revoke, and notification
- Incoming and outgoing filter rule management
- User identity and signature listing, creation, update, and deletion
- These operations never include domain policy, COS, delegated admin, or server configuration

### Compatibility-gated modules

- Files and Docs remain disabled until an official user-scoped API probe passes on the target
  Carbonio version
- Chats and rooms remain disabled until an official user-scoped API probe passes on the target
  Carbonio version
- A failed or unavailable probe is visible to the user and never silently falls back to an
  internal database or admin API

## Permanently excluded

- Authentication, password reset, recovery, and session management
- Account, domain, COS, server, queue, backup, and storage administration
- User impersonation and cross-account mailbox access
- Direct Carbonio database, mailbox file, or internal service access
- Commands intended for IMAP session internals, wait sets, mailbox synchronization internals,
  or operator maintenance

## Source authority

The command mapping is based on the official Carbonio API reference. Runtime support is still
verified against the exact deployed Carbonio version because some documented commands can differ
across server releases. Compatibility failures remain explicit and do not become unsupported
fallbacks.
