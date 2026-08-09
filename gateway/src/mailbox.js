import https from 'node:https';

import { logEvent } from './logger.js';

const soapUrl = new URL(
	process.env.CARBONIO_SOAP_URL ?? 'https://127.0.0.1:8443/service/soap'
);
const adminSoapUrl = new URL(
	process.env.CARBONIO_ADMIN_SOAP_URL ?? 'https://127.0.0.1:7071/service/admin/soap'
);
const loopbackSoapHosts = new Set(['127.0.0.1', '::1', 'localhost']);
const rejectUnauthorizedFor = (endpoint) => {
	if (loopbackSoapHosts.has(endpoint.hostname.toLowerCase())) {
		return process.env.CARBONIO_LOOPBACK_TLS_VERIFY === 'true';
	}
	return process.env.CARBONIO_ALLOW_INSECURE_REMOTE_TLS !== 'true';
};
const configuredSoapResponseMaxBytes = Number(
	process.env.CARBONIO_SOAP_MAX_RESPONSE_BYTES ?? 10_000_000
);
const soapResponseMaxBytes = Number.isSafeInteger(configuredSoapResponseMaxBytes)
	? Math.min(Math.max(configuredSoapResponseMaxBytes, 1_000_000), 50_000_000)
	: 10_000_000;
const soapTimeoutMs = Math.min(
	Math.max(Number(process.env.CARBONIO_SOAP_TIMEOUT_MS ?? 20_000), 5_000),
	30_000
);
const requiresGroupMembership = Boolean(
	process.env.AI_MODEL_POLICY_JSON || process.env.AI_TOOL_PERMISSION_POLICY_JSON
);
const groupCacheTtlMs = Math.min(
	Math.max(Number(process.env.AI_GROUP_CACHE_TTL_MS ?? 300_000), 30_000),
	900_000
);
const groupCache = new Map();

const createSoapError = (reason) => {
	const error = new Error(`Carbonio SOAP error: ${reason}`);
	if (
		/auth credentials have expired|no valid auth(?:entication)? token|service\.auth_(?:required|expired)/i.test(
			String(reason ?? '')
		)
	) {
		error.statusCode = 401;
	}
	return error;
};

export const soapRequest = (
	operation,
	body,
	cookie,
	namespace = 'urn:zimbraMail',
	endpoint = soapUrl
) =>
	new Promise((resolve, reject) => {
		const startedAt = Date.now();
		const payload = JSON.stringify({
			Header: {
				context: {
					_jsns: 'urn:zimbra'
				}
			},
			Body: {
				[`${operation}Request`]: {
					_jsns: namespace,
					...body
				}
			}
		});

		const request = https.request(
			{
				hostname: endpoint.hostname,
				port: endpoint.port || 443,
				path: `${endpoint.pathname}/${operation}Request`,
				method: 'POST',
				rejectUnauthorized: rejectUnauthorizedFor(endpoint),
				headers: {
					'content-type': 'application/json',
					'content-length': Buffer.byteLength(payload),
					...(cookie ? { cookie } : {})
				}
			},
			(response) => {
				const chunks = [];
				let responseBytes = 0;
				let responseTooLarge = false;
				response.on('data', (chunk) => {
					responseBytes += chunk.length;
					if (responseBytes > soapResponseMaxBytes) {
						responseTooLarge = true;
						response.destroy(new Error('Carbonio SOAP response exceeds the configured limit'));
						return;
					}
					chunks.push(chunk);
				});
				response.on('error', reject);
				response.on('end', () => {
					if (responseTooLarge) return;
					const text = Buffer.concat(chunks).toString('utf8');
					let data;
					try {
						data = JSON.parse(text);
					} catch {
						logEvent('error', 'soap_error', {
							operation,
							status: response.statusCode,
							duration_ms: Date.now() - startedAt,
							error: 'invalid_json'
						});
						reject(new Error(`Carbonio returned invalid JSON (${response.statusCode})`));
						return;
					}
					if ((response.statusCode ?? 500) >= 400 || data.Body?.Fault) {
						const reason =
							data.Body?.Fault?.Reason?.Text ??
							data.Body?.Fault?.Detail?.Error?.Code ??
							`HTTP ${response.statusCode}`;
						logEvent('warn', 'soap_error', {
							operation,
							status: response.statusCode,
							duration_ms: Date.now() - startedAt,
							error: reason
						});
						reject(createSoapError(reason));
						return;
					}
					logEvent('info', 'soap_response', {
						operation,
						status: response.statusCode,
						duration_ms: Date.now() - startedAt
					});
					resolve(data.Body?.[`${operation}Response`] ?? {});
				});
			}
		);

		request.setTimeout(soapTimeoutMs, () => {
			request.destroy(new Error(`Carbonio SOAP timed out after ${soapTimeoutMs} ms`));
		});
		request.on('error', (error) => {
			logEvent('error', 'soap_network_error', {
				operation,
				duration_ms: Date.now() - startedAt,
				error
			});
			reject(error);
		});
		request.end(payload);
	});

const normalizeEmail = (item) => ({
	id: item.id,
	revision: String(item.rev ?? item.ms ?? item.d ?? ''),
	conversationId: item.cid,
	subject: String(item.su || '(No subject)').slice(0, 300),
	preview: String(item.fr || '').slice(0, 500),
	timestamp: item.d,
	folderId: String(item.l ?? ''),
	unread: typeof item.f === 'string' && item.f.includes('u'),
	from: String(
		item.e?.find((address) => address.t === 'f')?.a ??
		item.e?.find((address) => address.t === 'f')?.p ??
		'Unknown sender'
	).slice(0, 320)
});

const normalizeAddress = (address) => ({
	address: String(address?.a ?? '').slice(0, 320),
	name: String(address?.d ?? address?.p ?? '').slice(0, 200),
	type: String(address?.t ?? '').slice(0, 4)
});

const contentValue = (value) =>
	typeof value === 'string' ? value : typeof value?._content === 'string' ? value._content : '';

const collectBodyParts = (part, results = []) => {
	if (!part || typeof part !== 'object') return results;
	if (Array.isArray(part)) {
		for (const child of part) collectBodyParts(child, results);
		return results;
	}
	const content = contentValue(part.content);
	if (
		part.body &&
		typeof content === 'string' &&
		['text/plain', 'text/html'].includes(part.ct)
	) {
		results.push({ type: part.ct, content });
	}
	for (const child of part.mp ?? []) collectBodyParts(child, results);
	return results;
};

const decodeHtmlEntities = (value) =>
	String(value)
		.replace(/&(nbsp|amp|lt|gt|quot|apos|#39|#(\d+));/gi, (match, entity, numericCode) => {
			if (numericCode) return String.fromCodePoint(Math.min(Number(numericCode), 0x10ffff));
			return {
				nbsp: ' ',
				amp: '&',
				lt: '<',
				gt: '>',
				quot: '"',
				apos: "'",
				'#39': "'"
			}[String(entity).toLowerCase()] ?? match;
		});

export const htmlToPlainText = (value) =>
	decodeHtmlEntities(
		String(value ?? '')
			.replace(/<(script|style|template|svg|iframe)[\s\S]*?<\/\1\s*>/gi, ' ')
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<\/p\s*>|<\/div\s*>|<\/li\s*>|<\/tr\s*>/gi, '\n')
			.replace(/<[^>]*>/g, ' ')
	)
		.replace(/[\t\f\v ]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

const collectAttachments = (part, results = []) => {
	if (!part || typeof part !== 'object') return results;
	if (Array.isArray(part)) {
		for (const child of part) collectAttachments(child, results);
		return results;
	}
	const filename = String(part.filename ?? '').trim();
	const disposition = String(part.cd ?? '').toLowerCase();
	if (filename || disposition === 'attachment') {
		results.push({
			part: String(part.part ?? '').slice(0, 100),
			filename: filename.slice(0, 500) || 'attachment',
			contentType: String(part.ct ?? 'application/octet-stream').slice(0, 200),
			size: Math.max(Number(part.s ?? 0) || 0, 0),
			disposition: disposition || 'attachment'
		});
	}
	for (const child of part.mp ?? []) collectAttachments(child, results);
	return results;
};

export const normalizeMessageForAgent = (message, maxBodyLength = 12_000) => {
	const parts = collectBodyParts(message.mp);
	const preferred = parts.find(({ type }) => type === 'text/plain') ?? parts[0];
	const originalBody = String(preferred?.content ?? contentValue(message.content));
	const normalizedBody =
		preferred?.type === 'text/html' ? htmlToPlainText(originalBody) : originalBody;
	return {
		...normalizeEmail(message),
		to: (message.e ?? []).filter(({ t }) => t === 't').map(normalizeAddress),
		cc: (message.e ?? []).filter(({ t }) => t === 'c').map(normalizeAddress),
		fromAddress: (message.e ?? []).find(({ t }) => t === 'f')?.a ?? '',
		messageIdHeader: String(message.mid ?? '').slice(0, 500),
		inReplyTo: String(message.irt ?? '').slice(0, 500),
		bodyType: 'text/plain',
		sourceBodyType: preferred?.type ?? 'text/plain',
		body: normalizedBody.slice(0, maxBodyLength),
		truncated: normalizedBody.length > maxBodyLength,
		attachments: collectAttachments(message.mp).slice(0, 100)
	};
};

const parseRecipients = (value, type) =>
	String(value ?? '')
		.split(',')
		.map((address) => address.trim())
		.filter(Boolean)
		.map((address) => ({ a: address, t: type }));

export const buildMailMessage = ({
	mode,
	draftId = '',
	to,
	cc = '',
	bcc = '',
	subject,
	body,
	from = '',
	originalId = '',
	replyType = ''
}) => ({
	...(draftId && mode === 'draft' ? { id: String(draftId) } : {}),
	...(draftId && mode === 'send' ? { did: String(draftId) } : {}),
	su: { _content: subject },
	e: [
		...parseRecipients(to, 't'),
		...parseRecipients(cc, 'c'),
		...parseRecipients(bcc, 'b'),
		...(from ? [{ a: from, t: 'f' }] : [])
	],
	mp: [
		{
			ct: 'text/plain',
			body: true,
			content: { _content: body }
		}
	],
	...(originalId ? { origid: originalId } : {}),
	...(replyType ? { rt: replyType } : {})
});

export const buildMessageActionRequest = ({ id, operation, folderId, tagName }) => {
	const itemId = String(id ?? '').trim();
	if (!itemId || /[\s,]/.test(itemId)) {
		throw new Error('A single Carbonio item ID is required');
	}
	if (!['read', '!read', 'flag', '!flag', 'tag', '!tag', 'move', 'spam', '!spam', 'delete'].includes(operation)) {
		throw new Error(`Unsupported Carbonio message action: ${operation}`);
	}
	if (['tag', '!tag'].includes(operation) && !String(tagName ?? '').trim()) {
		throw new Error('Tag name is required');
	}
	if (operation === 'move' && !String(folderId ?? '').trim()) {
		throw new Error('Destination folder ID is required');
	}
	return {
		action: {
			id: itemId,
			op: operation,
			...(['tag', '!tag'].includes(operation) ? { tn: String(tagName).trim() } : {}),
			...(operation === 'move' ? { l: String(folderId).trim() } : {})
		}
	};
};

export const messageAction = async ({ cookie, id, operation, folderId, tagName }) => {
	const request = buildMessageActionRequest({ id, operation, folderId, tagName });
	await soapRequest('MsgAction', request, cookie);
	const statuses = {
		read: 'marked_read',
		'!read': 'marked_unread',
		flag: 'flagged',
		'!flag': 'unflagged',
		tag: 'tag_added',
		'!tag': 'tag_removed',
		move: 'moved',
		spam: 'marked_spam',
		'!spam': 'marked_not_spam',
		delete: 'deleted_permanently'
	};
	return { id: String(id), operation, status: statuses[operation] };
};

export const searchEmails = async ({ cookie, query, limit = 10 }) => {
	const boundedLimit = Math.min(Math.max(Number(limit) || 10, 1), 20);
	const result = await soapRequest(
		'Search',
		{
			limit: boundedLimit,
			needExp: 1,
			recip: '2',
			sortBy: 'dateDesc',
			query,
			offset: 0,
			types: 'message'
		},
		cookie
	);

	return (result.m ?? []).slice(0, boundedLimit).map(normalizeEmail);
};

export const buildIndexEmailSearchRequest = ({ query = '', limit, offset }) => {
	const normalizedQuery = String(query ?? '').trim();
	return {
		limit,
		needExp: 1,
		recip: '2',
		sortBy: 'dateDesc',
		...(normalizedQuery ? { query: normalizedQuery } : {}),
		offset,
		types: 'message'
	};
};

export const searchEmailsForIndex = async ({ cookie, query = '', limit = 200 }) => {
	const boundedLimit = Math.min(Math.max(Number(limit) || 200, 1), 1_000);
	const messages = [];
	for (let offset = 0; offset < boundedLimit; offset += 100) {
		const pageLimit = Math.min(100, boundedLimit - offset);
		const result = await soapRequest(
			'Search',
			buildIndexEmailSearchRequest({ query, limit: pageLimit, offset }),
			cookie
		);
		const page = (result.m ?? []).map(normalizeEmail);
		messages.push(...page);
		if (page.length < pageLimit || result.more !== true) break;
	}
	return messages.slice(0, boundedLimit);
};

export const getEmail = async ({ cookie, id, maxBodyLength = 12_000 }) => {
	const boundedLength = Math.min(Math.max(Number(maxBodyLength) || 12_000, 1_000), 24_000);
	const result = await soapRequest(
		'GetMsg',
		{
			m: {
				id,
				read: 0,
				html: 0,
				neuter: 1,
				max: boundedLength,
				wantContent: 'original'
			}
		},
		cookie
	);
	if (!result.m?.[0] && !result.m?.id) throw new Error('Carbonio message was not found');
	return normalizeMessageForAgent(result.m?.[0] ?? result.m, boundedLength);
};

export const getEmailAttachments = async ({ cookie, id }) => {
	const message = await getEmail({ cookie, id, maxBodyLength: 1_000 });
	return message.attachments;
};

const safeTextAttachmentTypes = new Set([
	'text/plain',
	'text/csv',
	'text/markdown',
	'application/json',
	'application/xml',
	'text/xml'
]);

export const downloadAttachmentBuffer = ({ cookie, messageId, attachment, maxBytes = 10_000_000 }) =>
	new Promise((resolve, reject) => {
		const declaredType = String(attachment.contentType ?? '').split(';')[0].toLowerCase();
		const boundedMaxBytes = Math.min(Math.max(Number(maxBytes) || 10_000_000, 1_000), 25_000_000);
		if (Number(attachment.size ?? 0) > boundedMaxBytes) return reject(new Error('Attachment exceeds extraction limit'));
		const path = `/service/content/get?id=${encodeURIComponent(messageId)}&part=${encodeURIComponent(attachment.part)}`;
		const request = https.request(
			{
				hostname: soapUrl.hostname,
				port: soapUrl.port || 443,
				path,
				method: 'GET',
				rejectUnauthorized: rejectUnauthorizedFor(soapUrl),
				headers: cookie ? { cookie } : {}
			},
			(response) => {
				if ((response.statusCode ?? 500) >= 300) {
					response.resume();
					reject(new Error(`Carbonio attachment download returned HTTP ${response.statusCode}`));
					return;
				}
				const responseType = String(response.headers['content-type'] ?? declaredType)
					.split(';')[0]
					.toLowerCase();
				const chunks = [];
				let bytes = 0;
				response.on('data', (chunk) => {
					bytes += chunk.length;
					if (bytes > boundedMaxBytes) request.destroy(new Error('Attachment exceeds extraction limit'));
					else chunks.push(chunk);
				});
				response.on('end', () => {
					resolve({ buffer: Buffer.concat(chunks), declaredType, responseType });
				});
			}
		);
		request.setTimeout(soapTimeoutMs, () => request.destroy(new Error('Attachment extraction timed out')));
		request.on('error', reject);
		request.end();
	});

export const downloadSafeTextAttachment = async ({ cookie, messageId, attachment }) => {
	const declaredType = String(attachment.contentType ?? '').split(';')[0].toLowerCase();
	if (!safeTextAttachmentTypes.has(declaredType)) return { text: '', extraction: 'unsupported_type' };
	if (Number(attachment.size ?? 0) > 2_000_000) return { text: '', extraction: 'size_limit' };
	const { buffer, responseType } = await downloadAttachmentBuffer({
		cookie,
		messageId,
		attachment,
		maxBytes: 2_000_000
	});
	if (!safeTextAttachmentTypes.has(responseType)) return { text: '', extraction: 'mime_mismatch' };
	if (buffer.includes(0)) return { text: '', extraction: 'binary_rejected' };
	const text = buffer.toString('utf8');
	if (text.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) {
		return { text: '', extraction: 'malware_quarantined' };
	}
	return { text: text.slice(0, 200_000), extraction: 'safe_text' };
};

export const getEmailThread = async ({ cookie, conversationId, maxBodyLength = 8_000 }) => {
	const boundedLength = Math.min(Math.max(Number(maxBodyLength) || 8_000, 1_000), 12_000);
	const result = await soapRequest(
		'GetConv',
		{
			c: {
				id: conversationId,
				fetch: 'all',
				html: 0,
				max: boundedLength
			}
		},
		cookie
	);
	const conversation = result.c?.[0] ?? result.c;
	if (!conversation) throw new Error('Carbonio conversation was not found');
	const messages = [...(conversation.m ?? []), ...(conversation.chat ?? [])]
		.sort((left, right) => Number(left.d ?? 0) - Number(right.d ?? 0))
		.slice(-10)
		.map((message) => normalizeMessageForAgent(message, boundedLength));
	return {
		id: String(conversation.id ?? conversationId),
		subject: String(conversation.su ?? '(No subject)').slice(0, 300),
		total: Number(conversation.total ?? conversation.n ?? messages.length),
		messages
	};
};

export const createEmailDraft = async ({
	cookie,
	draftId = '',
	to,
	cc = '',
	bcc = '',
	subject,
	body,
	from = '',
	originalId = '',
	replyType = ''
}) => {
	const message = buildMailMessage({
		mode: 'draft',
		draftId,
		to,
		cc,
		bcc,
		subject,
		body,
		from,
		originalId,
		replyType
	});
	const result = await soapRequest('SaveDraft', { m: message }, cookie);
	const saved = result.m?.[0] ?? result.m ?? result.chat?.[0] ?? result.chat;
	if (!saved?.id) throw new Error('Carbonio did not return the saved draft ID');
	return {
		id: String(saved.id),
		conversationId: String(saved.cid ?? ''),
		subject,
		to: parseRecipients(to, 't').map(({ a }) => a),
		status: 'saved_to_drafts'
	};
};

export const sendEmail = async ({
	cookie,
	draftId = '',
	to,
	cc = '',
	bcc = '',
	subject,
	body,
	from = '',
	originalId = '',
	replyType = ''
}) => {
	const message = buildMailMessage({
		mode: 'send',
		draftId,
		to,
		cc,
		bcc,
		subject,
		body,
		from,
		originalId,
		replyType
	});
	const result = await soapRequest('SendMsg', { m: message }, cookie);
	const sent = result.m?.[0] ?? result.m;
	if (!sent?.id) throw new Error('Carbonio did not return the sent message ID');
	return {
		id: String(sent.id),
		conversationId: String(sent.cid ?? ''),
		subject,
		to: parseRecipients(to, 't').map(({ a }) => a),
		status: 'sent'
	};
};

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const normalizeFolder = (folder) => ({
	id: String(folder.id ?? ''),
	name: String(folder.name ?? '').slice(0, 300),
	path: String(folder.absFolderPath ?? '').slice(0, 1_000),
	parentId: String(folder.l ?? ''),
	view: String(folder.view ?? '').slice(0, 40),
	itemCount: Math.max(Number(folder.n ?? 0) || 0, 0),
	unreadCount: Math.max(Number(folder.u ?? 0) || 0, 0),
	deletable: [true, 1, '1'].includes(folder.deletable)
});

const flattenFolders = (folders, results = []) => {
	for (const folder of asArray(folders)) {
		if (folder?.id) results.push(normalizeFolder(folder));
		flattenFolders(folder?.folder, results);
	}
	return results;
};

export const buildCreateFolderRequest = ({ name, parentId, view = 'message' }) => ({
	folder: { name: String(name).trim(), l: String(parentId).trim(), view }
});

export const buildFolderActionRequest = ({ id, operation, name = '', parentId = '' }) => {
	const folderId = String(id ?? '').trim();
	if (!folderId || /[\s,]/.test(folderId)) throw new Error('A single Carbonio folder ID is required');
	if (!['rename', 'move', 'trash', 'empty'].includes(operation)) {
		throw new Error(`Unsupported Carbonio folder action: ${operation}`);
	}
	if (operation === 'rename' && !String(name).trim()) throw new Error('New folder name is required');
	if (operation === 'move' && !String(parentId).trim()) throw new Error('Parent folder ID is required');
	return {
		action: {
			id: folderId,
			op: operation,
			...(operation === 'rename' ? { name: String(name).trim() } : {}),
			...(operation === 'move' ? { l: String(parentId).trim() } : {}),
			...(operation === 'empty' ? { recursive: 1 } : {})
		}
	};
};

export const listFolders = async ({ cookie, view = '' }) => {
	const result = await soapRequest(
		'GetFolder',
		{ visible: 1, depth: -1, ...(view ? { view } : {}) },
		cookie
	);
	return flattenFolders(result.folder).slice(0, 500);
};

export const createFolder = async ({ cookie, name, parentId, view = 'message' }) => {
	const result = await soapRequest(
		'CreateFolder',
		buildCreateFolderRequest({ name, parentId, view }),
		cookie
	);
	const folder = asArray(result.folder)[0] ?? result.folder;
	if (!folder?.id) throw new Error('Carbonio did not return the created folder ID');
	return { ...normalizeFolder(folder), status: 'created' };
};

export const folderAction = async ({ cookie, id, operation, name = '', parentId = '' }) => {
	await soapRequest(
		'FolderAction',
		buildFolderActionRequest({ id, operation, name, parentId }),
		cookie
	);
	return {
		id: String(id),
		operation,
		status: operation === 'trash' ? 'moved_to_trash' : operation === 'empty' ? 'emptied' : `${operation}d`
	};
};

const normalizeTag = (tag) => ({
	id: String(tag.id ?? ''),
	name: String(tag.name ?? '').slice(0, 128),
	color: Number(tag.color ?? 0) || 0,
	rgb: String(tag.rgb ?? '').slice(0, 7),
	itemCount: Math.max(Number(tag.n ?? 0) || 0, 0),
	unreadCount: Math.max(Number(tag.u ?? 0) || 0, 0)
});

export const buildTagActionRequest = ({ id, operation, name = '' }) => {
	const tagId = String(id ?? '').trim();
	if (!tagId || /[\s,]/.test(tagId)) throw new Error('A single Carbonio tag ID is required');
	if (!['rename', 'delete'].includes(operation)) {
		throw new Error(`Unsupported Carbonio tag action: ${operation}`);
	}
	if (operation === 'rename' && !String(name).trim()) throw new Error('New tag name is required');
	return {
		action: {
			id: tagId,
			op: operation,
			...(operation === 'rename' ? { name: String(name).trim() } : {})
		}
	};
};

export const listTags = async ({ cookie }) => {
	const result = await soapRequest('GetTag', {}, cookie);
	return asArray(result.tag).slice(0, 500).map(normalizeTag);
};

export const createTag = async ({ cookie, name, rgb = '' }) => {
	const result = await soapRequest(
		'CreateTag',
		{ tag: { name: String(name).trim(), ...(rgb ? { rgb } : {}) } },
		cookie
	);
	const tag = asArray(result.tag)[0] ?? result.tag;
	if (!tag?.id) throw new Error('Carbonio did not return the created tag ID');
	return { ...normalizeTag(tag), status: 'created' };
};

export const tagAction = async ({ cookie, id, operation, name = '' }) => {
	await soapRequest('TagAction', buildTagActionRequest({ id, operation, name }), cookie);
	return { id: String(id), operation, status: operation === 'delete' ? 'deleted' : 'renamed' };
};

export const getCurrentAccount = async (cookie) => {
	if (!cookie) throw new Error('Carbonio authentication is required');
	const result = await soapRequest('GetInfo', {}, cookie, 'urn:zimbraAccount');
	if (!result.id || !result.name) throw new Error('Unable to resolve Carbonio account');
	const account = { id: result.id, name: result.name, groups: [] };
	if (!requiresGroupMembership) return account;
	const cached = groupCache.get(account.id);
	if (cached && cached.expiresAt > Date.now()) return { ...account, groups: cached.groups };
	const memberships = await soapRequest(
		'GetAccountDistributionLists',
		{ memberOf: 'all', ownerOf: 0 },
		cookie,
		'urn:zimbraAccount'
	);
	const groups = [
		...new Set((memberships.dl ?? []).map(({ name }) => String(name ?? '').toLowerCase()).filter(Boolean))
	];
	groupCache.set(account.id, { groups, expiresAt: Date.now() + groupCacheTtlMs });
	return { ...account, groups };
};

export const getCurrentAdminSession = async (cookie) => {
	if (!/(?:^|;\s*)ZM_ADMIN_AUTH_TOKEN=/.test(String(cookie ?? ''))) {
		throw new Error('Carbonio administrator authentication is required');
	}
	await soapRequest('GetAllServers', {}, cookie, 'urn:zimbraAdmin', adminSoapUrl);
	return {
		id: 'carbonio-global-admin-session',
		name: 'carbonio-global-admin-session',
		groups: [],
		adminConsoleAuthenticated: true
	};
};

export const getAdminAccountNameById = async (cookie, accountId) => {
	const normalizedId = String(accountId ?? '').trim();
	if (!normalizedId) return '';
	const result = await soapRequest(
		'GetAccount',
		{ account: { by: 'id', _content: normalizedId } },
		cookie,
		'urn:zimbraAdmin',
		adminSoapUrl
	);
	return String(result.name ?? '').trim().slice(0, 320);
};

export const normalizeAdminAccount = (account) => {
	const attributes = {
		...(account?._attrs ?? {}),
		...Object.fromEntries(
			asArray(account?.a)
				.filter((item) => item?.name)
				.map((item) => [String(item.name), item._content])
		)
	};
	return {
		id: String(account?.id ?? attributes.zimbraId ?? '').trim(),
		name: String(account?.name ?? '').trim().toLowerCase(),
		displayName: String(attributes.displayName ?? '').trim().slice(0, 320),
		status: String(attributes.zimbraAccountStatus ?? 'active').trim().toLowerCase(),
		systemResource: String(attributes.zimbraIsSystemResource ?? '').toLowerCase() === 'true'
	};
};

const isInternalCarbonioAccount = ({ name, systemResource }) => {
	if (systemResource) return true;
	const localPart = String(name ?? '').split('@')[0];
	return /^(?:spam\.|ham\.|virus-quarantine\.|galsync\.)/i.test(localPart);
};

const escapeLdapFilterValue = (value) =>
	String(value ?? '').replace(/[\\*()\0]/g, (character) => {
		if (character === '\\') return '\\5c';
		if (character === '*') return '\\2a';
		if (character === '(') return '\\28';
		if (character === ')') return '\\29';
		return '\\00';
	});

export const buildAdminAccountSearchFilter = (query) => {
	const escapedQuery = escapeLdapFilterValue(String(query ?? '').trim().slice(0, 200));
	return escapedQuery
		? `(|(mail=*${escapedQuery}*)(uid=*${escapedQuery}*)(displayName=*${escapedQuery}*))`
		: '';
};

export const listAdminAccounts = async (cookie, { query = '', offset = 0, limit = 50 } = {}) => {
	const normalizedQuery = String(query ?? '').trim().slice(0, 200);
	const searchFilter = buildAdminAccountSearchFilter(normalizedQuery);
	const normalizedOffset = Math.max(Number.parseInt(offset, 10) || 0, 0);
	const normalizedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 100);
	const result = await soapRequest(
		'SearchDirectory',
		{
			types: 'accounts',
			limit: normalizedLimit,
			offset: normalizedOffset,
			sortBy: 'name',
			sortAscending: 1,
			attrs: 'displayName,zimbraAccountStatus,zimbraIsSystemResource',
			...(searchFilter ? { query: searchFilter } : {})
		},
		cookie,
		'urn:zimbraAdmin',
		adminSoapUrl
	);
	const accounts = asArray(result.account)
		.map(normalizeAdminAccount)
		.filter(({ id, name }) => id && name)
		.filter((account) => !isInternalCarbonioAccount(account));
	return {
		accounts,
		offset: normalizedOffset,
		limit: normalizedLimit,
		more: result.more === true || result.more === 1 || result.more === '1',
		total: Number.isFinite(Number(result.total)) ? Number(result.total) : null
	};
};

export const getAdminAccountById = async (cookie, accountId) => {
	const normalizedId = String(accountId ?? '').trim();
	if (!normalizedId) throw new Error('Carbonio account ID is required');
	const result = await soapRequest(
		'GetAccount',
		{
			account: { by: 'id', _content: normalizedId },
			attrs: 'displayName,zimbraAccountStatus,zimbraIsSystemResource'
		},
		cookie,
		'urn:zimbraAdmin',
		adminSoapUrl
	);
	const responseAccount = asArray(result.account)[0] ?? result.account ?? result;
	const account = normalizeAdminAccount(responseAccount);
	if (!account.id || !account.name || isInternalCarbonioAccount(account)) {
		throw new Error('Carbonio account is not eligible for AI access');
	}
	return account;
};
