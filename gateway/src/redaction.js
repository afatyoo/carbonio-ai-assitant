const patterns = [
	[/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1[REDACTED]'],
	[/\b(api[-_ ]?key|access[-_ ]?token|secret|password)\s*[:=]\s*[^\s,;]{6,}/gi, '$1=[REDACTED]'],
	[/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_CARD_NUMBER]'],
	[/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]']
];

export const redactSensitiveText = (value) => {
	let redacted = String(value ?? '');
	for (const [pattern, replacement] of patterns) redacted = redacted.replace(pattern, replacement);
	return redacted;
};

export const redactForProvider = (value) => {
	if (typeof value === 'string') return redactSensitiveText(value);
	if (Array.isArray(value)) return value.map(redactForProvider);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, nested]) => [key, redactForProvider(nested)])
	);
};
