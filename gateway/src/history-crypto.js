import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const keyValue = process.env.AI_HISTORY_ENCRYPTION_KEY ?? '';
const key = keyValue ? Buffer.from(keyValue, 'base64') : null;
if (process.env.AI_DATABASE_URL && key?.length !== 32) {
	throw new Error('AI_HISTORY_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
}

export const encryptHistoryText = (value, associatedData) => {
	if (!key) throw new Error('History encryption key is not configured');
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(Buffer.from(associatedData, 'utf8'));
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join(':');
};

export const decryptHistoryText = (value, associatedData) => {
	if (!key) throw new Error('History encryption key is not configured');
	const [version, encodedIv, encodedTag, encodedCiphertext] = String(value).split(':');
	if (version !== 'v1' || !encodedIv || !encodedTag || encodedCiphertext === undefined) {
		throw new Error('Unsupported encrypted history value');
	}
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encodedIv, 'base64url'));
	decipher.setAAD(Buffer.from(associatedData, 'utf8'));
	decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
	return Buffer.concat([
		decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
		decipher.final()
	]).toString('utf8');
};
