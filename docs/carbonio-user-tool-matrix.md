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
| Mail | `archive_email`, `restore_email` | `WRITE` | `GetMsg`, `GetFolder`, `MsgAction` |
| Mail | `remove_attachment` | `DESTRUCTIVE` | `GetMsg`, `RemoveAttachments` |
| Calendar | `get_appointment`, `search_appointments` | `READ` | `GetAppointment`, `Search` |
| Calendar | `check_free_busy`, `propose_meeting_slots` | `READ` | `GetFreeBusy` |
| Calendar | `create_calendar_draft`, `update_appointment` | `DRAFT` | `SetAppointment`, `GetAppointment`, `ModifyAppointment` |
| Calendar | `create_appointment`, `send_meeting_invitation` | `WRITE` | `CreateAppointment`, `GetAppointment`, `ModifyAppointment` |
| Calendar | `cancel_appointment` | `DESTRUCTIVE` | `GetAppointment`, `CancelAppointment` |
| Contacts | `search_contacts`, `resolve_attendees` | `READ` | `AutoComplete` |
| Contacts | `list_contacts`, `get_contact` | `READ` | `GetContacts` |
| Contacts | `create_contact`, `update_contact`, `move_contact`, `tag_contact` | `WRITE` | `CreateContact`, `ModifyContact`, `ContactAction` |
| Contacts | `delete_contact` | `DESTRUCTIVE` | `GetContacts`, `ContactAction` |
| Calendar | `list_calendars` | `READ` | `GetFolder` |
| Calendar | `create_calendar`, `rename_calendar` | `WRITE` | `CreateFolder`, `FolderAction` |
| Calendar | `delete_calendar` | `DESTRUCTIVE` | `DeleteCalendar` |
| Calendar | `respond_to_invitation`, `forward_appointment` | `WRITE` | `SendInviteReply`, `ForwardAppointment` |
| Calendar | `dismiss_alarm`, `snooze_alarm` | `WRITE` | `DismissCalendarItemAlarm`, `SnoozeCalendarItemAlarm` |
| Sharing | `list_shares` | `READ` | `GetFolder` ACL and mountpoint metadata |
| Sharing | `grant_share`, `send_share_notification` | `WRITE` | `FolderAction`, `SendShareNotification` |
| Sharing | `revoke_share` | `DESTRUCTIVE` | `FolderAction` |
| Preferences | `list_filter_rules`, `list_identities`, `list_signatures` | `READ` | `GetFilterRules`, `GetIdentities`, `GetSignatures` |
| Preferences | `create_filter_rule`, `update_filter_rule`, `create_identity`, `update_identity`, `create_signature`, `update_signature` | `WRITE` | `ModifyFilterRules`, Identity and Signature account APIs |
| Preferences | `delete_filter_rule`, `delete_identity`, `delete_signature` | `DESTRUCTIVE` | Filter, Identity, and Signature delete APIs |

There are 74 active user-scoped tools. Every mutating tool requires a single-use confirmation,
and exact existing targets are fetched again after confirmation wherever the API exposes revision
or stable identity metadata.

## Compatibility gates

- Task search and exact retrieval use the appointment-backed compatibility fallback but remain
  gated until authenticated live synchronization passes
- Task create, update, complete, reopen, and delete remain unavailable on the target server
  because its SOAP dispatcher returns `service.UNKNOWN_DOCUMENT` for the documented task commands
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
