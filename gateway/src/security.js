const normalizeList = (value) =>
	String(value ?? '')
		.split(',')
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);

const adminAccounts = new Set(normalizeList(process.env.AI_ADMIN_ACCOUNTS));
const allowedOrigins = new Set(normalizeList(process.env.AI_ALLOWED_ORIGINS));
const minuteLimit = Math.min(Math.max(Number(process.env.AI_REQUESTS_PER_MINUTE ?? 30), 1), 10_000);
const dailyLimit = Math.min(Math.max(Number(process.env.AI_REQUESTS_PER_DAY ?? 500), 1), 1_000_000);
const usage = new Map();

export const isAiEnabled = () => process.env.AI_ENABLED !== 'false';
export const areWriteToolsEnabled = () => process.env.AI_WRITE_TOOLS_ENABLED !== 'false';

export const isAdminAccount = (account) =>
	Boolean(
		account &&
			(adminAccounts.has(String(account.id).toLowerCase()) ||
				adminAccounts.has(String(account.name).toLowerCase()))
	);

export const requireAdminAccount = (account) => {
	if (!isAdminAccount(account)) {
		const error = new Error('Administrator permission is required');
		error.statusCode = 403;
		throw error;
	}
};

export const assertSameOrigin = (request) => {
	if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method ?? '')) return;
	const fetchSite = String(request.headers['sec-fetch-site'] ?? '').toLowerCase();
	if (fetchSite === 'cross-site') {
		const error = new Error('Cross-site request rejected');
		error.statusCode = 403;
		throw error;
	}
	const origin = String(request.headers.origin ?? '').trim();
	if (!origin) return;
	let parsed;
	try {
		parsed = new URL(origin);
	} catch {
		const error = new Error('Invalid request origin');
		error.statusCode = 403;
		throw error;
	}
	const host = String(request.headers['x-forwarded-host'] ?? request.headers.host ?? '')
		.split(',')[0]
		.trim()
		.toLowerCase();
	if (parsed.host.toLowerCase() !== host && !allowedOrigins.has(origin.toLowerCase())) {
		const error = new Error('Request origin is not allowed');
		error.statusCode = 403;
		throw error;
	}
};

export const consumeAccountQuota = async (ownerId) => {
	const now = Date.now();
	const day = new Date(now).toISOString().slice(0, 10);
	const key = String(ownerId);
	const current = usage.get(key) ?? {
		minuteStartedAt: now,
		minuteCount: 0,
		day
	};
	if (now - current.minuteStartedAt >= 60_000) {
		current.minuteStartedAt = now;
		current.minuteCount = 0;
	}
	if (current.day !== day) {
		current.day = day;
	}
	if (current.minuteCount >= minuteLimit) {
		const error = new Error('AI request quota exceeded');
		error.statusCode = 429;
		throw error;
	}
	current.minuteCount += 1;
	usage.set(key, current);
	const dailyCount = await consumeDailyRequest(key, day, dailyLimit);
	if (dailyCount === null) {
		const error = new Error('AI daily request quota exceeded');
		error.statusCode = 429;
		throw error;
	}
	return {
		minuteRemaining: Math.max(minuteLimit - current.minuteCount, 0),
		dailyRemaining: Math.max(dailyLimit - dailyCount, 0)
	};
};

export const getSecurityPolicy = () => ({
	adminAccountsConfigured: adminAccounts.size > 0,
	requestsPerMinute: minuteLimit,
	requestsPerDay: dailyLimit,
	aiEnabled: isAiEnabled(),
	writeToolsEnabled: areWriteToolsEnabled()
});
import { consumeDailyRequest } from './history.js';
