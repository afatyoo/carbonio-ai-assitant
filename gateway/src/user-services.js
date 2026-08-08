import { listFolders, soapRequest } from './mailbox.js';
import { getAppointment } from './calendar.js';

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const text = (value, maximum = 20_000) => String(value ?? '').slice(0, maximum);
const exactId = (value, label = 'item') => {
	const id = text(value, 100).trim();
	if (!id || /[\s,]/.test(id)) throw new Error(`A single Carbonio ${label} ID is required`);
	return id;
};
const parseJson = (value, label) => {
	let parsed;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error(`${label} must be valid JSON`);
	}
	return parsed;
};
const attributes = (value, label = 'attributesJson') => {
	const parsed = parseJson(value, label);
	if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
		throw new Error(`${label} must be a JSON object`);
	}
	return Object.entries(parsed).slice(0, 100).map(([name, content]) => ({
		n: text(name, 100),
		_content: text(content, 10_000)
	}));
};

const normalizeContact = (contact) => ({
	id: text(contact?.id, 100),
	folderId: text(contact?.l, 100),
	revision: Number(contact?.rev ?? 0) || 0,
	modifiedSequence: Number(contact?.ms ?? 0) || 0,
	tags: text(contact?.tn ?? contact?.t, 1_000),
	attributes: Object.fromEntries(
		asArray(contact?.a).slice(0, 100).map((attribute) => [
			text(attribute?.n, 100),
			text(attribute?._content, 10_000)
		])
	),
	members: asArray(contact?.m).slice(0, 200).map((member) => ({
		type: text(member?.type, 4),
		value: text(member?.value, 1_000)
	}))
});

export const listContacts = async ({ cookie, folderId = '7', limit = 200 }) => {
	const result = await soapRequest('GetContacts', { l: folderId, sync: 1 }, cookie);
	return asArray(result.cn).slice(0, limit).map(normalizeContact);
};

export const getContact = async ({ cookie, id }) => {
	const contactId = exactId(id, 'contact');
	const result = await soapRequest('GetContacts', { sync: 1, cn: [{ id: contactId }] }, cookie);
	const contact = asArray(result.cn)[0];
	if (!contact?.id) throw new Error(`Carbonio contact ${contactId} was not found`);
	return normalizeContact(contact);
};

export const createContact = async ({ cookie, folderId = '7', attributesJson }) => {
	const result = await soapRequest(
		'CreateContact',
		{ verbose: 1, wantModSeq: 1, cn: { l: exactId(folderId, 'folder'), a: attributes(attributesJson) } },
		cookie
	);
	const contact = asArray(result.cn)[0] ?? result.cn;
	if (!contact?.id) throw new Error('Carbonio did not return the created contact ID');
	return { ...normalizeContact(contact), status: 'created' };
};

export const updateContact = async ({ cookie, id, revision, attributesJson }) => {
	const current = await getContact({ cookie, id });
	if (Number(revision) !== current.revision) throw new Error('Contact changed since preview; refresh and confirm again');
	const result = await soapRequest(
		'ModifyContact',
		{ replace: 1, verbose: 1, wantModSeq: 1, cn: { id: current.id, a: attributes(attributesJson) } },
		cookie
	);
	return { ...normalizeContact(asArray(result.cn)[0] ?? result.cn ?? { id: current.id }), status: 'updated' };
};

export const contactAction = async ({ cookie, id, revision, operation, folderId = '', tagName = '' }) => {
	const current = await getContact({ cookie, id });
	if (Number(revision) !== current.revision) throw new Error('Contact changed since preview; refresh and confirm again');
	const allowed = new Set(['move', 'tag', '!tag', 'trash']);
	if (!allowed.has(operation)) throw new Error(`Unsupported contact action: ${operation}`);
	const action = {
		id: current.id,
		op: operation,
		...(operation === 'move' ? { l: exactId(folderId, 'folder') } : {}),
		...(['tag', '!tag'].includes(operation) ? { tn: text(tagName, 128).trim() } : {})
	};
	if (['tag', '!tag'].includes(operation) && !action.tn) throw new Error('Tag name is required');
	await soapRequest('ContactAction', { action }, cookie);
	return { id: current.id, operation, status: operation === 'trash' ? 'moved_to_trash' : 'updated' };
};

export const listCalendars = ({ cookie }) => listFolders({ cookie, view: 'appointment' });

const revalidateAppointment = async ({ cookie, appointmentId, inviteId = '', revision, subject }) => {
	const current = await getAppointment({ cookie, id: exactId(appointmentId, 'appointment') });
	if (Number(revision) !== current.revision || current.subject !== subject || (inviteId && current.inviteId !== inviteId)) {
		throw new Error('Appointment changed since preview; refresh and confirm again');
	}
	return current;
};

export const respondToInvitation = async ({ cookie, appointmentId, inviteId, componentNum, revision, subject, response }) => {
	await revalidateAppointment({ cookie, appointmentId, inviteId, revision, subject });
	const verbs = { accept: 'ACCEPT', tentative: 'TENTATIVE', decline: 'DECLINE' };
	const verb = verbs[response];
	if (!verb) throw new Error('Invitation response is not supported');
	const result = await soapRequest('SendInviteReply', {
		id: exactId(inviteId, 'invite'),
		compNum: componentNum,
		verb,
		updateOrganizer: 1
	}, cookie);
	return { appointmentId: text(result.calItemId ?? result.apptId), inviteId: text(result.invId ?? inviteId), response };
};

const recipients = (value) => text(value, 5_000).split(',').map((email) => email.trim()).filter(Boolean);
export const forwardAppointment = async ({ cookie, appointmentId, revision, recipients: recipientList, subject, body = '' }) => {
	await revalidateAppointment({ cookie, appointmentId, revision, subject });
	const e = recipients(recipientList).map((address) => ({ a: address, t: 't' }));
	if (e.length === 0 || e.length > 50) throw new Error('Between 1 and 50 recipients is required');
	await soapRequest('ForwardAppointment', {
		id: exactId(appointmentId, 'appointment'),
		m: { e, su: { _content: text(subject, 300) }, mp: [{ ct: 'text/plain', body: true, content: { _content: text(body) } }] }
	}, cookie);
	return { appointmentId, recipients: e.map(({ a }) => a), status: 'forwarded' };
};

export const updateAlarm = async ({ cookie, appointmentId, revision, subject, operation, at }) => {
	await revalidateAppointment({ cookie, appointmentId, revision, subject });
	const id = exactId(appointmentId, 'appointment');
	const timestamp = Date.parse(at);
	if (!Number.isFinite(timestamp)) throw new Error('Alarm timestamp must be an ISO date');
	if (operation === 'dismiss') {
		await soapRequest('DismissCalendarItemAlarm', { appt: [{ id, dismissedAt: timestamp }] }, cookie);
	} else {
		await soapRequest('SnoozeCalendarItemAlarm', { appt: [{ id, until: timestamp }] }, cookie);
	}
	return { appointmentId: id, operation, at: new Date(timestamp).toISOString() };
};

export const deleteCalendar = async ({ cookie, id }) => {
	const calendarId = exactId(id, 'calendar');
	await soapRequest('DeleteCalendar', { id: calendarId }, cookie);
	return { id: calendarId, status: 'deleted' };
};

const normalizeIdentity = (identity) => ({
	id: text(identity?.id, 100),
	name: text(identity?.name, 300),
	attributes: Object.fromEntries(asArray(identity?.a).map((item) => [text(item?.name, 100), text(item?._content, 10_000)]))
});
export const listIdentities = async ({ cookie }) => {
	const result = await soapRequest('GetIdentities', {}, cookie, 'urn:zimbraAccount');
	return asArray(result.identity).slice(0, 100).map(normalizeIdentity);
};
export const createIdentity = async ({ cookie, name, attributesJson }) => {
	const result = await soapRequest('CreateIdentity', { identity: { name: text(name, 300), a: attributes(attributesJson).map(({ n, _content }) => ({ name: n, _content })) } }, cookie, 'urn:zimbraAccount');
	return { ...normalizeIdentity(result.identity ?? { name }), status: 'created' };
};
export const updateIdentity = async ({ cookie, id, name, attributesJson }) => {
	const identities = await listIdentities({ cookie });
	if (!identities.some((identity) => identity.id === id && identity.name === name)) throw new Error('Identity changed since preview; refresh and confirm again');
	await soapRequest('ModifyIdentity', { identity: { id: exactId(id, 'identity'), name, a: attributes(attributesJson).map(({ n, _content }) => ({ name: n, _content })) } }, cookie, 'urn:zimbraAccount');
	return { id, name, status: 'updated' };
};
export const deleteIdentity = async ({ cookie, id, name }) => {
	const identities = await listIdentities({ cookie });
	if (!identities.some((identity) => identity.id === id && identity.name === name)) throw new Error('Identity changed since preview; refresh and confirm again');
	await soapRequest('DeleteIdentity', { identity: { id: exactId(id, 'identity') } }, cookie, 'urn:zimbraAccount');
	return { id, name, status: 'deleted' };
};

const normalizeSignature = (signature) => ({
	id: text(signature?.id, 100),
	name: text(signature?.name, 300),
	content: asArray(signature?.content).slice(0, 2).map((item) => ({ type: text(item?.type, 30), value: text(item?._content) }))
});
export const listSignatures = async ({ cookie }) => {
	const result = await soapRequest('GetSignatures', {}, cookie, 'urn:zimbraAccount');
	return asArray(result.signature).slice(0, 100).map(normalizeSignature);
};
const signatureSpec = ({ id, name, content, contentType }) => ({
	...(id ? { id: exactId(id, 'signature') } : {}),
	name: text(name, 300),
	content: [{ type: contentType, _content: text(content) }]
});
export const createSignature = async ({ cookie, ...input }) => {
	const result = await soapRequest('CreateSignature', { signature: signatureSpec(input) }, cookie, 'urn:zimbraAccount');
	return { ...normalizeSignature(result.signature ?? input), status: 'created' };
};
export const updateSignature = async ({ cookie, id, currentName, ...input }) => {
	const signatures = await listSignatures({ cookie });
	if (!signatures.some((signature) => signature.id === id && signature.name === currentName)) throw new Error('Signature changed since preview; refresh and confirm again');
	await soapRequest('ModifySignature', { signature: signatureSpec({ id, ...input }) }, cookie, 'urn:zimbraAccount');
	return { id, name: input.name, status: 'updated' };
};
export const deleteSignature = async ({ cookie, id, name }) => {
	const signatures = await listSignatures({ cookie });
	if (!signatures.some((signature) => signature.id === id && signature.name === name)) throw new Error('Signature changed since preview; refresh and confirm again');
	await soapRequest('DeleteSignature', { signature: { id: exactId(id, 'signature') } }, cookie, 'urn:zimbraAccount');
	return { id, name, status: 'deleted' };
};

export const listFilterRules = async ({ cookie }) => {
	const result = await soapRequest('GetFilterRules', {}, cookie);
	return asArray(result.filterRules?.filterRule).slice(0, 100);
};
const replaceFilterRules = async ({ cookie, operation, name, ruleJson = '' }) => {
	const current = await listFilterRules({ cookie });
	const index = current.findIndex((rule) => rule.name === name);
	if (operation !== 'create' && index < 0) throw new Error('Filter rule changed since preview; refresh and confirm again');
	if (operation === 'create' && index >= 0) throw new Error('A filter rule with this name already exists');
	const nextRule = operation === 'delete' ? null : parseJson(ruleJson, 'ruleJson');
	if (nextRule && (Array.isArray(nextRule) || typeof nextRule !== 'object')) throw new Error('ruleJson must be a JSON object');
	if (nextRule) nextRule.name = name;
	const next = [...current];
	if (operation === 'create') next.push(nextRule);
	else if (operation === 'delete') next.splice(index, 1);
	else next[index] = nextRule;
	await soapRequest('ModifyFilterRules', { filterRules: { filterRule: next } }, cookie);
	return { name, operation, status: operation === 'delete' ? 'deleted' : `${operation}d` };
};
export const createFilterRule = (input) => replaceFilterRules({ ...input, operation: 'create' });
export const updateFilterRule = (input) => replaceFilterRules({ ...input, operation: 'update' });
export const deleteFilterRule = (input) => replaceFilterRules({ ...input, operation: 'delete' });

export const listShares = async ({ cookie }) => {
	const folders = await soapRequest('GetFolder', { visible: 1, depth: -1 }, cookie);
	const sharedFolders = [];
	const incoming = [];
	const collect = (items) => {
		for (const folder of asArray(items)) {
			const grants = asArray(folder?.acl?.grant).slice(0, 100).map((grant) => ({
				granteeId: text(grant?.zid, 100),
				granteeType: text(grant?.gt, 20),
				grantee: text(grant?.d, 320),
				permission: text(grant?.perm, 30)
			}));
			if (grants.length) sharedFolders.push({ id: text(folder?.id, 100), name: text(folder?.name, 300), grants });
			for (const link of asArray(folder?.link).slice(0, 500)) {
				incoming.push({
					id: text(link?.id, 100),
					name: text(link?.name, 300),
					ownerId: text(link?.zid, 100),
					owner: text(link?.owner, 320),
					remoteId: text(link?.rid, 100),
					permission: text(link?.perm, 30),
					view: text(link?.view, 40)
				});
			}
			collect(folder?.folder);
		}
	};
	collect(folders.folder);
	for (const link of asArray(folders.link).slice(0, 500)) {
		incoming.push({ id: text(link?.id, 100), name: text(link?.name, 300), ownerId: text(link?.zid, 100), owner: text(link?.owner, 320), remoteId: text(link?.rid, 100), permission: text(link?.perm, 30), view: text(link?.view, 40) });
	}
	return { incoming: incoming.slice(0, 500), outgoing: sharedFolders.slice(0, 500) };
};
export const grantShare = async ({ cookie, folderId, granteeType, grantee, permission }) => {
	const action = { id: exactId(folderId, 'folder'), op: 'grant', grant: { gt: granteeType, perm: permission, ...(!['all', 'pub'].includes(granteeType) ? { d: grantee } : {}) } };
	const result = await soapRequest('FolderAction', { action }, cookie);
	return { folderId, granteeType, grantee, permission, granteeId: text(result.action?.zid), status: 'granted' };
};
export const revokeShare = async ({ cookie, folderId, granteeId }) => {
	const action = { id: exactId(folderId, 'folder'), op: '!grant', zid: exactId(granteeId, 'grantee') };
	await soapRequest('FolderAction', { action }, cookie);
	return { folderId, granteeId, status: 'revoked' };
};
export const sendShareNotification = async ({ cookie, folderId, recipients: recipientList, action = 'edit' }) => {
	const e = recipients(recipientList).map((address) => ({ a: address, t: 't' }));
	if (e.length === 0 || e.length > 50) throw new Error('Between 1 and 50 recipients is required');
	await soapRequest('SendShareNotification', { action, item: { id: exactId(folderId, 'folder') }, e }, cookie);
	return { folderId, recipients: e.map(({ a }) => a), action, status: 'sent' };
};

export const removeAttachment = async ({ cookie, messageId, part }) => {
	const id = exactId(messageId, 'message');
	const attachmentPart = text(part, 100).trim();
	if (!attachmentPart || /\s|,/.test(attachmentPart)) throw new Error('A single attachment part is required');
	await soapRequest('RemoveAttachments', { m: { id, part: attachmentPart } }, cookie);
	return { messageId: id, part: attachmentPart, status: 'removed' };
};
