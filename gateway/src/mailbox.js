import https from 'node:https';

import { logEvent } from './logger.js';

const soapUrl = new URL(
	process.env.CARBONIO_SOAP_URL ?? 'https://127.0.0.1:8443/service/soap'
);
const soapTimeoutMs = Math.min(
	Math.max(Number(process.env.CARBONIO_SOAP_TIMEOUT_MS ?? 20_000), 5_000),
	30_000
);

const soapRequest = (operation, body, cookie, namespace = 'urn:zimbraMail') =>
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
				hostname: soapUrl.hostname,
				port: soapUrl.port || 443,
				path: `${soapUrl.pathname}/${operation}Request`,
				method: 'POST',
				rejectUnauthorized: false,
				headers: {
					'content-type': 'application/json',
					'content-length': Buffer.byteLength(payload),
					...(cookie ? { cookie } : {})
				}
			},
			(response) => {
				const chunks = [];
				response.on('data', (chunk) => chunks.push(chunk));
				response.on('end', () => {
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
						reject(new Error(`Carbonio SOAP error: ${reason}`));
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
	conversationId: item.cid,
	subject: String(item.su || '(No subject)').slice(0, 300),
	preview: String(item.fr || '').slice(0, 500),
	timestamp: item.d,
	unread: typeof item.f === 'string' && item.f.includes('u'),
	from: String(
		item.e?.find((address) => address.t === 'f')?.a ??
		item.e?.find((address) => address.t === 'f')?.p ??
		'Unknown sender'
	).slice(0, 320)
});

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

export const getCurrentAccount = async (cookie) => {
	if (!cookie) throw new Error('Carbonio authentication is required');
	const result = await soapRequest('GetInfo', {}, cookie, 'urn:zimbraAccount');
	if (!result.id || !result.name) throw new Error('Unable to resolve Carbonio account');
	return { id: result.id, name: result.name };
};
