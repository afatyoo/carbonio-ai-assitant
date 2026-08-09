import fs from 'node:fs';
import path from 'node:path';

import { consumeDailyRequest, getDailyUsage } from './history.js';
import { parseScopedPolicy, resolveScopedPolicy } from './account-policy.js';

const normalizeList = (value) =>
	String(value ?? '')
		.split(',')
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);

const adminAccounts = new Set(normalizeList(process.env.AI_ADMIN_ACCOUNTS));
const allowedOrigins = new Set(normalizeList(process.env.AI_ALLOWED_ORIGINS));
const enabledAccounts = new Set(normalizeList(process.env.AI_ENABLED_ACCOUNTS));
const writeToolAccounts = new Set(normalizeList(process.env.AI_WRITE_TOOL_ACCOUNTS));
const minuteLimit = Math.min(Math.max(Number(process.env.AI_REQUESTS_PER_MINUTE ?? 30), 1), 10_000);
const dailyLimit = Math.min(Math.max(Number(process.env.AI_REQUESTS_PER_DAY ?? 500), 1), 1_000_000);
const dailyTokenLimit = Math.min(
	Math.max(Number(process.env.AI_TOKENS_PER_DAY ?? 250_000), 1_000),
	100_000_000
);
const toolPermissionPolicy = parseScopedPolicy(
	process.env.AI_TOOL_PERMISSION_POLICY_JSON,
	'AI_TOOL_PERMISSION_POLICY_JSON'
);
const knownToolPermissions = new Set([
	'mail.read',
	'mail.draft',
	'mail.write',
	'calendar.read',
	'calendar.write',
	'contacts.read',
	'contacts.write',
	'sharing.read',
	'sharing.write',
	'preferences.read',
	'preferences.write',
	'tasks.read',
	'tasks.write'
]);
const usage = new Map();
const runtimeStatePath = path.resolve('.runtime/security-state.json');
const accountAccessPath = path.resolve('.runtime/account-access.json');
const readRuntimeState = () => {
	try {
		const parsed = JSON.parse(fs.readFileSync(runtimeStatePath, 'utf8'));
		return { writeToolsEnabled: parsed.writeToolsEnabled !== false, updatedAt: Number(parsed.updatedAt) || null };
	} catch {
		return { writeToolsEnabled: true, updatedAt: null };
	}
};
const runtimeState = readRuntimeState();

const readAccountAccessState = () => {
	try {
		const parsed = JSON.parse(fs.readFileSync(accountAccessPath, 'utf8'));
		const overrides = parsed?.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {};
		return { version: 1, overrides };
	} catch {
		return { version: 1, overrides: {} };
	}
};
const accountAccessState = readAccountAccessState();

const persistRuntimeState = () => {
	fs.mkdirSync(path.dirname(runtimeStatePath), { recursive: true, mode: 0o700 });
	fs.writeFileSync(runtimeStatePath, `${JSON.stringify(runtimeState, null, 2)}\n`, { mode: 0o600 });
	fs.chmodSync(runtimeStatePath, 0o600);
};

const persistAccountAccessState = () => {
	fs.mkdirSync(path.dirname(accountAccessPath), { recursive: true, mode: 0o700 });
	const temporaryPath = `${accountAccessPath}.${process.pid}.tmp`;
	fs.writeFileSync(temporaryPath, `${JSON.stringify(accountAccessState, null, 2)}\n`, { mode: 0o600 });
	fs.renameSync(temporaryPath, accountAccessPath);
	fs.chmodSync(accountAccessPath, 0o600);
};

export const isAiEnabled = () => process.env.AI_ENABLED !== 'false';
const matchesAccount = (allowlist, account) =>
	allowlist.has(String(account?.id ?? '').toLowerCase()) ||
	allowlist.has(String(account?.name ?? '').toLowerCase());

const accessOverride = (account) => {
	const byId = accountAccessState.overrides[String(account?.id ?? '').toLowerCase()];
	if (byId) return byId;
	const normalizedName = String(account?.name ?? '').toLowerCase();
	return Object.values(accountAccessState.overrides).find(
		(entry) => String(entry?.name ?? '').toLowerCase() === normalizedName
	);
};

export const getAccountAccess = (account) => {
	const override = accessOverride(account);
	const defaultAiEnabled = enabledAccounts.size === 0 || matchesAccount(enabledAccounts, account);
	const defaultWriteToolsEnabled =
		writeToolAccounts.size === 0 || matchesAccount(writeToolAccounts, account);
	const aiEnabled = override ? override.aiEnabled === true : defaultAiEnabled;
	return {
		aiEnabled,
		writeToolsEnabled: aiEnabled && (override ? override.writeToolsEnabled === true : defaultWriteToolsEnabled),
		managed: Boolean(override),
		updatedAt: Number(override?.updatedAt) || null,
		updatedBy: String(override?.updatedBy ?? '')
	};
};

export const updateAccountAccess = (accounts, updatedBy = 'carbonio-global-admin-session') => {
	if (!Array.isArray(accounts) || accounts.length < 1 || accounts.length > 100) {
		throw new Error('Account access update requires between 1 and 100 accounts');
	}
	const now = Date.now();
	const normalizedUpdatedBy = String(updatedBy ?? '').trim().slice(0, 320);
	const updated = accounts.map((account) => {
		const id = String(account?.id ?? '').trim().toLowerCase();
		const name = String(account?.name ?? '').trim().toLowerCase();
		if (!/^[a-z0-9-]{8,100}$/.test(id) || !name.includes('@') || name.length > 320) {
			throw new Error('Invalid Carbonio account access target');
		}
		if (typeof account.aiEnabled !== 'boolean' || typeof account.writeToolsEnabled !== 'boolean') {
			throw new Error('AI access and write-tool access must be boolean values');
		}
		const value = {
			name,
			aiEnabled: account.aiEnabled,
			writeToolsEnabled: account.aiEnabled && account.writeToolsEnabled,
			updatedAt: now,
			updatedBy: normalizedUpdatedBy
		};
		accountAccessState.overrides[id] = value;
		return { id, ...value, managed: true };
	});
	persistAccountAccessState();
	return updated;
};

export const isAccountEnabled = (account) =>
	getAccountAccess(account).aiEnabled;

export const requireAiAccess = (account) => {
	if (!isAccountEnabled(account)) {
		const error = new Error('AI Assistant is not enabled for this account');
		error.statusCode = 403;
		throw error;
	}
};

export const areWriteToolsEnabled = (account) =>
	process.env.AI_WRITE_TOOLS_ENABLED !== 'false' &&
	runtimeState.writeToolsEnabled &&
	(accessOverride(account)
		? getAccountAccess(account).writeToolsEnabled
		: writeToolAccounts.size === 0 || matchesAccount(writeToolAccounts, account));

export const getRuntimeSafetyState = () => ({
	writeToolsEnabled: process.env.AI_WRITE_TOOLS_ENABLED !== 'false' && runtimeState.writeToolsEnabled,
	environmentAllowsWrites: process.env.AI_WRITE_TOOLS_ENABLED !== 'false',
	updatedAt: runtimeState.updatedAt
});

export const updateRuntimeSafetyState = ({ writeToolsEnabled }) => {
	if (typeof writeToolsEnabled !== 'boolean') throw new Error('writeToolsEnabled must be boolean');
	if (writeToolsEnabled && process.env.AI_WRITE_TOOLS_ENABLED === 'false') {
		throw new Error('Write tools are disabled by environment policy');
	}
	runtimeState.writeToolsEnabled = writeToolsEnabled;
	runtimeState.updatedAt = Date.now();
	persistRuntimeState();
	return getRuntimeSafetyState();
};

export const getToolPermissions = (account) => {
	const defaults = ['mail.read', 'calendar.read', 'contacts.read', 'sharing.read', 'preferences.read', 'tasks.read'];
	if (areWriteToolsEnabled(account)) defaults.push('mail.draft', 'mail.write', 'calendar.write', 'contacts.write', 'sharing.write', 'preferences.write', 'tasks.write');
	const resolved = resolveScopedPolicy(toolPermissionPolicy, account, defaults).filter((permission) =>
		knownToolPermissions.has(permission)
	);
	if (!areWriteToolsEnabled(account)) {
		return resolved.filter((permission) => !permission.endsWith('.write') && permission !== 'mail.draft');
	}
	return resolved;
};

export const isAdminAccount = (account) =>
	Boolean(
		account &&
			(account.adminConsoleAuthenticated === true ||
				adminAccounts.has(String(account.id).toLowerCase()) ||
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
	const tokenUsage = await getDailyUsage(key, day);
	if (tokenUsage.totalTokens >= dailyTokenLimit) {
		const error = new Error('AI daily token quota exceeded');
		error.statusCode = 429;
		throw error;
	}
	const dailyCount = await consumeDailyRequest(key, day, dailyLimit);
	if (dailyCount === null) {
		const error = new Error('AI daily request quota exceeded');
		error.statusCode = 429;
		throw error;
	}
	current.minuteCount += 1;
	usage.set(key, current);
	return {
		minuteRemaining: Math.max(minuteLimit - current.minuteCount, 0),
		dailyRemaining: Math.max(dailyLimit - dailyCount, 0),
		tokenRemaining: Math.max(dailyTokenLimit - tokenUsage.totalTokens, 0)
	};
};

export const getAccountUsage = async (ownerId) => {
	const usageDate = new Date().toISOString().slice(0, 10);
	const current = await getDailyUsage(String(ownerId), usageDate);
	return {
		date: usageDate,
		...current,
		requestLimit: dailyLimit,
		tokenLimit: dailyTokenLimit,
		requestRemaining: Math.max(dailyLimit - current.requestCount, 0),
		tokenRemaining: Math.max(dailyTokenLimit - current.totalTokens, 0)
	};
};

export const getSecurityPolicy = () => ({
	adminAccountsConfigured: adminAccounts.size > 0,
	requestsPerMinute: minuteLimit,
	requestsPerDay: dailyLimit,
	tokensPerDay: dailyTokenLimit,
	aiEnabled: isAiEnabled(),
	writeToolsEnabled: getRuntimeSafetyState().writeToolsEnabled,
	writeToolsEnvironmentEnabled: process.env.AI_WRITE_TOOLS_ENABLED !== 'false',
	writeToolsRuntimeUpdatedAt: runtimeState.updatedAt,
	enabledAccountPolicyConfigured: enabledAccounts.size > 0,
	writeToolAccountPolicyConfigured: writeToolAccounts.size > 0,
	toolPermissionPolicyConfigured: toolPermissionPolicy.size > 0
});
