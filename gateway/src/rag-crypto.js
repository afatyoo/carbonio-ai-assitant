import { decryptHistoryText, encryptHistoryText } from './history-crypto.js';

const aad = (ownerId, kind, id) => `rag:${ownerId}:${kind}:${id}`;

export const encryptRagText = (ownerId, kind, id, value) =>
	encryptHistoryText(String(value ?? ''), aad(ownerId, kind, id));

export const decryptRagText = (ownerId, kind, id, value) =>
	decryptHistoryText(value, aad(ownerId, kind, id));
