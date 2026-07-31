import https from 'node:https';

const soapUrl = new URL(
	process.env.CARBONIO_SOAP_URL ?? 'https://127.0.0.1:8443/service/soap'
);

const soapRequest = (operation, body, cookie, namespace = 'urn:zimbraMail') =>
	new Promise((resolve, reject) => {
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
						reject(new Error(`Carbonio returned invalid JSON (${response.statusCode})`));
						return;
					}
					if ((response.statusCode ?? 500) >= 400 || data.Body?.Fault) {
						const reason =
							data.Body?.Fault?.Reason?.Text ??
							data.Body?.Fault?.Detail?.Error?.Code ??
							`HTTP ${response.statusCode}`;
						reject(new Error(`Carbonio SOAP error: ${reason}`));
						return;
					}
					resolve(data.Body?.[`${operation}Response`] ?? {});
				});
			}
		);

		request.on('error', reject);
		request.end(payload);
	});

const normalizeEmail = (item) => ({
	id: item.id,
	conversationId: item.cid,
	subject: item.su || '(Tanpa subjek)',
	preview: item.fr || '',
	timestamp: item.d,
	unread: typeof item.f === 'string' && item.f.includes('u'),
	from:
		item.e?.find((address) => address.t === 'f')?.a ??
		item.e?.find((address) => address.t === 'f')?.p ??
		'Unknown sender'
});

export const searchEmails = async ({ cookie, query, limit = 10 }) => {
	const result = await soapRequest(
		'Search',
		{
			limit,
			needExp: 1,
			recip: '2',
			fullConversation: 1,
			wantContent: 'full',
			sortBy: 'dateDesc',
			query,
			offset: 0,
			types: 'message'
		},
		cookie
	);

	return (result.m ?? []).slice(0, limit).map(normalizeEmail);
};

export const getCurrentAccount = async (cookie) => {
	if (!cookie) throw new Error('Carbonio authentication is required');
	const result = await soapRequest('GetInfo', {}, cookie, 'urn:zimbraAccount');
	if (!result.id || !result.name) throw new Error('Unable to resolve Carbonio account');
	return { id: result.id, name: result.name };
};
