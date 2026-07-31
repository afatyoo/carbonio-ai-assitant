import { searchEmails } from './mailbox.js';
import { getAgentConfig } from './config.js';

const selectTool = (message) => {
	const value = message.toLowerCase();
	if (value.includes('belum dibaca') || value.includes('unread')) {
		return { name: 'list_unread_emails', query: 'is:unread', limit: 10 };
	}
	if (
		value.includes('email') ||
		value.includes('mail') ||
		value.includes('ringkas') ||
		value.includes('penting')
	) {
		return { name: 'search_emails', query: 'in:inbox', limit: 10 };
	}
	return null;
};

const localAnswer = (message, toolResult) => {
	if (!toolResult) {
		return `Gateway AI sudah terhubung. Mode agent lokal aktif karena AI_AGENT_URL belum dikonfigurasi. Pesan diterima: “${message}”`;
	}
	if (toolResult.items.length === 0) {
		return `Saya sudah menjalankan ${toolResult.name}, tetapi tidak menemukan email yang cocok.`;
	}
	const lines = toolResult.items.slice(0, 5).map(
		(item, index) =>
			`${index + 1}. ${item.subject} — ${item.from}${item.unread ? ' (belum dibaca)' : ''}`
	);
	return `Saya menemukan ${toolResult.items.length} email:\n\n${lines.join(
		'\n'
	)}\n\nMode lokal menampilkan hasil dasar. Setelah AI_AGENT_URL dipasang, agent akan membuat rangkuman dan rekomendasi tindakan.`;
};

const remoteAnswer = async ({ message, toolResult, requestedModel }) => {
	const config = getAgentConfig();
	const model = requestedModel || config.model;
	const systemPrompt =
		'You are Carbonio AI, an email assistant. Answer in the language used by the user. Use the provided mailbox tool result and never invent emails.';
	const userPrompt = `${message}\n\nMailbox tool result:\n${JSON.stringify(toolResult)}`;
	const isOpenAiCompatible = ['openrouter', 'openai', 'deepseek'].includes(config.provider);
	const endpoint = isOpenAiCompatible
		? `${config.agentUrl.replace(/\/$/, '')}/chat/completions`
		: config.provider === 'gemini'
			? `${config.agentUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent`
			: config.agentUrl;
	const headers = {
		'content-type': 'application/json',
		...(config.provider === 'anthropic'
			? {
					'x-api-key': config.apiKey,
					'anthropic-version': '2023-06-01'
				}
			: config.provider === 'gemini'
				? { 'x-goog-api-key': config.apiKey }
				: config.apiKey
					? { authorization: `Bearer ${config.apiKey}` }
					: {})
	};
	const body =
		config.provider === 'anthropic'
			? {
					model,
					max_tokens: 2048,
					system: systemPrompt,
					messages: [{ role: 'user', content: userPrompt }]
				}
			: config.provider === 'gemini'
				? {
						systemInstruction: { parts: [{ text: systemPrompt }] },
						contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
					}
				: isOpenAiCompatible
					? {
							model,
							messages: [
								{ role: 'system', content: systemPrompt },
								{ role: 'user', content: userPrompt }
							]
						}
					: {
							message,
							context: { toolResult },
							model
						};
	const response = await fetch(endpoint, {
		method: 'POST',
		headers,
		body: JSON.stringify(body)
	});
	if (!response.ok) {
		const errorText = await response.text();
		let detail = errorText.slice(0, 240);
		try {
			const errorJson = JSON.parse(errorText);
			detail = errorJson.error?.message ?? errorJson.message ?? detail;
		} catch {
			// Keep the bounded text response.
		}
		throw new Error(`AI Agent returned HTTP ${response.status}: ${detail}`);
	}
	const data = await response.json();
	return (
		data.choices?.[0]?.message?.content ??
		data.content?.find((item) => item.type === 'text')?.text ??
		data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ??
		data.output_text ??
		data.message ??
		data.text ??
		JSON.stringify(data)
	);
};

export const runAgent = async ({ message, model, cookie, emit }) => {
	const config = getAgentConfig();
	const tool = selectTool(message);
	let toolResult = null;

	if (tool) {
		emit('tool', { name: tool.name, status: 'running' });
		const items = await searchEmails({
			cookie,
			query: tool.query,
			limit: tool.limit
		});
		toolResult = { name: tool.name, items };
		emit('tool', { name: tool.name, status: 'completed', count: items.length });
	}

	const answer = config.agentUrl
		? await remoteAnswer({ message, toolResult, requestedModel: model })
		: localAnswer(message, toolResult);

	for (const chunk of answer.match(/.{1,42}(\s|$)/g) ?? [answer]) {
		emit('message', { text: chunk });
	}
	emit('done', {});
};
