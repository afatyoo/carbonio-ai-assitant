const normalizeValues = (values) =>
	[...new Set((Array.isArray(values) ? values : []).map((value) => String(value).trim()).filter(Boolean))];

export const parseScopedPolicy = (value, label) => {
	if (!String(value ?? '').trim()) return new Map();
	let parsed;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error(`${label} must be valid JSON`);
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${label} must be a JSON object`);
	}
	const policy = new Map();
	for (const [selector, values] of Object.entries(parsed)) {
		const key = selector.trim().toLowerCase();
		if (!/^(account|group|domain):[^\s]+$/.test(key) && key !== '*') {
			throw new Error(`${label} contains an invalid selector: ${selector}`);
		}
		const normalized = normalizeValues(values);
		if (!normalized.length) throw new Error(`${label} selector ${selector} has no values`);
		policy.set(key, normalized);
	}
	return policy;
};

const unionMatches = (policy, selectors) =>
	[
		...new Set(
			selectors.flatMap((selector) => policy.get(selector.toLowerCase()) ?? [])
		)
	];

export const resolveScopedPolicy = (policy, account, fallback = []) => {
	if (!policy?.size) return normalizeValues(fallback);
	const accountSelectors = [account?.id, account?.name]
		.filter(Boolean)
		.map((value) => `account:${String(value).toLowerCase()}`);
	const accountValues = unionMatches(policy, accountSelectors);
	if (accountValues.length) return accountValues;

	const groupValues = unionMatches(
		policy,
		(account?.groups ?? []).map((group) => `group:${String(group).toLowerCase()}`)
	);
	if (groupValues.length) return groupValues;

	const domain = String(account?.name ?? '').split('@')[1]?.toLowerCase();
	const domainValues = domain ? unionMatches(policy, [`domain:${domain}`]) : [];
	if (domainValues.length) return domainValues;

	return normalizeValues(policy.get('*') ?? fallback);
};
