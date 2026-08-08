import {
	getAppointment,
	getPersonalContactsForIndex,
	searchAppointments,
	searchTasksForIndex
} from './calendar.js';
import { downloadSafeTextAttachment, getEmail, searchEmailsForIndex } from './mailbox.js';
import { assertAvailableRagModule } from './rag-modules.js';
import { normalizeRagText } from './rag-text.js';

const mailDocument = (message) => ({
	id: String(message.id),
	revision: String(message.revision ?? message.timestamp ?? ''),
	title: message.subject,
	deepLink: `/mails/message/${encodeURIComponent(message.id)}`,
	metadata: {
		conversationId: message.conversationId ?? '',
		from: message.fromAddress || message.from,
		timestamp: message.timestamp,
		unread: message.unread,
		attachments: message.attachments?.map(({ filename, contentType, size }) => ({
			filename,
			contentType,
			size
		})) ?? []
	},
	content: normalizeRagText(
		[
			`Subject: ${message.subject}`,
			`From: ${message.fromAddress || message.from}`,
			`To: ${(message.to ?? []).map(({ address }) => address).join(', ')}`,
			`Cc: ${(message.cc ?? []).map(({ address }) => address).join(', ')}`,
			message.body
		].join('\n')
	)
});

const collectMail = async (cookie, attachmentsOnly = false) => {
	const metadata = await searchEmailsForIndex({
		cookie,
		query: attachmentsOnly ? 'has:attachment' : '',
		limit: Number(process.env.AI_RAG_MAIL_LIMIT ?? 500)
	});
	const documents = [];
	for (const item of metadata) {
		const message = await getEmail({ cookie, id: item.id, maxBodyLength: 24_000 });
		if (attachmentsOnly) {
			for (const attachment of message.attachments ?? []) {
				let extracted = { text: '', extraction: 'metadata_only' };
				try {
					extracted = await downloadSafeTextAttachment({
						cookie,
						messageId: message.id,
						attachment
					});
				} catch {
					extracted = { text: '', extraction: 'failed_closed' };
				}
				documents.push({
					id: `${message.id}:${attachment.part}`,
					revision: String(message.revision ?? message.timestamp ?? ''),
					title: attachment.filename,
					deepLink: `/mails/message/${encodeURIComponent(message.id)}`,
					metadata: {
						parentMessageId: message.id,
						parentSubject: message.subject,
						contentType: attachment.contentType,
						size: attachment.size,
						extraction: extracted.extraction
					},
					content: normalizeRagText(
						`Attachment ${attachment.filename}\nContent type: ${attachment.contentType}\nParent email: ${message.subject}\nFrom: ${message.fromAddress || message.from}\n${extracted.text}`
					)
				});
			}
		} else {
			documents.push(mailDocument(message));
		}
	}
	return documents;
};

const collectCalendar = async (cookie) => {
	const matches = new Map();
	const now = Date.now();
	for (let offsetDays = -365; offsetDays < 730; offsetDays += 90) {
		const start = new Date(now + offsetDays * 86_400_000).toISOString();
		const end = new Date(now + Math.min(offsetDays + 90, 730) * 86_400_000).toISOString();
		const appointments = await searchAppointments({ cookie, start, end, limit: 50 });
		for (const appointment of appointments) matches.set(appointment.id, appointment);
	}
	const documents = [];
	for (const appointment of matches.values()) {
		const details = await getAppointment({ cookie, id: appointment.id });
		documents.push({
			id: details.id,
			revision: `${details.revision}:${details.modifiedSequence}`,
			title: details.subject,
			deepLink: `/calendar/appointment/${encodeURIComponent(details.id)}`,
			metadata: {
				appointmentId: details.id,
				start: details.start,
				end: details.end,
				status: details.status,
				recurring: details.recurring
			},
			content: normalizeRagText(
				`${details.subject}\nStart: ${details.start}\nEnd: ${details.end}\nLocation: ${details.location}\nOrganizer: ${details.organizer}\nAttendees: ${details.attendees.join(', ')}\n${details.body}`
			)
		});
	}
	return documents;
};

export const collectRagDocuments = async (moduleValue, { cookie }) => {
	const module = assertAvailableRagModule(moduleValue);
	if (module === 'mail') return collectMail(cookie, false);
	if (module === 'attachments') return collectMail(cookie, true);
	if (module === 'calendar') return collectCalendar(cookie);
	if (module === 'tasks') {
		return (await searchTasksForIndex({ cookie })).map((task) => ({
			id: task.id,
			revision: task.revision,
			title: task.title,
			deepLink: `/tasks/task/${encodeURIComponent(task.id)}`,
			metadata: { status: task.status, percentComplete: task.percentComplete, due: task.due },
			content: normalizeRagText(`${task.title}\n${task.body}`)
		}));
	}
	if (module === 'contacts') {
		return (await getPersonalContactsForIndex({ cookie })).map((contact) => ({
			id: contact.id,
			revision: contact.revision,
			title: contact.title,
			deepLink: `/contacts/contact/${encodeURIComponent(contact.id)}`,
			metadata: { emails: contact.emails, phones: contact.phones },
			content: normalizeRagText(
				`${contact.title}\nEmails: ${contact.emails.join(', ')}\nPhones: ${contact.phones.join(', ')}\nCompany: ${contact.company}\n${contact.notes}`
			)
		}));
	}
	return [];
};

export const revalidateRagResults = async (results, { cookie }) => {
	const validated = [];
	let tasks = null;
	let contacts = null;
	for (const result of results) {
		try {
			if (result.module === 'mail' || result.module === 'attachments') {
				const messageId = result.module === 'attachments'
					? String(result.metadata.parentMessageId ?? result.sourceId.split(':')[0])
					: result.sourceId;
				const current = await getEmail({ cookie, id: messageId, maxBodyLength: 1_000 });
				if (String(current.revision ?? current.timestamp ?? '') !== String(result.revision ?? '')) continue;
			} else if (result.module === 'calendar') {
				const appointmentId = String(result.metadata.appointmentId ?? result.sourceId.split(':')[0]);
				const current = await getAppointment({ cookie, id: appointmentId });
				if (`${current.revision}:${current.modifiedSequence}` !== String(result.revision)) continue;
			} else if (result.module === 'tasks') {
				tasks ??= await searchTasksForIndex({ cookie });
				const current = tasks.find(({ id }) => id === result.sourceId);
				if (!current || String(current.revision) !== String(result.revision)) continue;
			} else if (result.module === 'contacts') {
				contacts ??= await getPersonalContactsForIndex({ cookie });
				const current = contacts.find(({ id }) => id === result.sourceId);
				if (!current || String(current.revision) !== String(result.revision)) continue;
			}
			validated.push(result);
		} catch {
			// Deleted, revoked, stale, or unreadable sources are excluded fail-closed.
		}
	}
	return validated;
};
