import React, { FormEvent, useEffect, useState } from 'react';

import styled from '@emotion/styled';
import { Button } from '@zextras/carbonio-design-system';

import { parseJsonResponse } from '../api/response';
import { RobotMark } from '../components/robot-icon';
import {
	ChatMessage,
	NEW_CHAT_EVENT,
	OPEN_CHAT_EVENT,
	createConversationId,
	getConversation,
	getConversations,
	saveConversation
} from '../history/chat-history';

type ModelOption = {
	id: string;
	name: string;
	free: boolean;
	contextLength?: number;
};

const Page = styled.div`
	height: 100%;
	min-height: 0;
	display: flex;
	background: ${({ theme }): string => theme.palette.gray6.regular};
	color: ${({ theme }): string => theme.palette.text.regular};
`;

const Conversation = styled.main`
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
`;

const Header = styled.header`
	height: 4rem;
	padding: 0 1.5rem;
	display: flex;
	align-items: center;
	justify-content: space-between;
	border-bottom: 0.0625rem solid ${({ theme }): string => theme.palette.gray3.regular};
`;

const Status = styled.span`
	font-size: 0.75rem;
	padding: 0.35rem 0.65rem;
	border-radius: 1rem;
	color: ${({ theme }): string => theme.palette.success.regular};
	background: ${({ theme }): string => theme.palette.gray4.regular};
`;

const HeaderActions = styled.div`
	display: flex;
	align-items: center;
	gap: 0.75rem;
`;

const ModelSelect = styled.select`
	max-width: 16rem;
	padding: 0.45rem 2rem 0.45rem 0.7rem;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray3.regular};
	border-radius: 0.5rem;
	background: ${({ theme }): string => theme.palette.gray5.regular};
	color: inherit;
	font: inherit;
	font-size: 0.8rem;
`;

const Messages = styled.div`
	flex: 1;
	overflow: auto;
	padding: 2rem max(1.5rem, calc((100% - 48rem) / 2));
`;

const Empty = styled.div`
	height: 100%;
	display: grid;
	place-content: center;
	text-align: center;
`;

const Orb = styled.div`
	width: 4rem;
	height: 4rem;
	margin: 0 auto 1rem;
	border-radius: 1.25rem;
	display: grid;
	place-content: center;
	color: white;
	background: linear-gradient(135deg, #2b73d2, #7656d6);
`;

const Suggestions = styled.div`
	display: grid;
	grid-template-columns: repeat(2, minmax(12rem, 1fr));
	gap: 0.75rem;
	margin-top: 2rem;
`;

const Suggestion = styled.button`
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray3.regular};
	border-radius: 0.75rem;
	background: ${({ theme }): string => theme.palette.gray6.regular};
	color: inherit;
	padding: 0.9rem;
	text-align: left;
	cursor: pointer;

	&:hover {
		border-color: ${({ theme }): string => theme.palette.primary.regular};
	}
`;

const Bubble = styled.div<{ role: 'assistant' | 'user' }>`
	max-width: 80%;
	margin: 0 0 1rem ${({ role }): string => (role === 'user' ? 'auto' : '0')};
	padding: 0.9rem 1rem;
	border-radius: 1rem;
	white-space: pre-wrap;
	line-height: 1.5;
	background: ${({ role, theme }): string =>
		role === 'user' ? theme.palette.primary.regular : theme.palette.gray4.regular};
	color: ${({ role, theme }): string =>
		role === 'user' ? theme.palette.gray6.regular : theme.palette.text.regular};
`;

const Composer = styled.form`
	margin: 0 max(1.5rem, calc((100% - 48rem) / 2)) 1.5rem;
	padding: 0.5rem 0.5rem 0.5rem 1rem;
	display: flex;
	align-items: flex-end;
	gap: 0.5rem;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray2.regular};
	border-radius: 1rem;
	background: ${({ theme }): string => theme.palette.gray6.regular};
	box-shadow: 0 0.5rem 2rem rgb(0 0 0 / 8%);
`;

const Input = styled.textarea`
	flex: 1;
	min-height: 2.25rem;
	max-height: 8rem;
	resize: none;
	border: 0;
	outline: 0;
	padding: 0.55rem 0;
	font: inherit;
	background: transparent;
	color: inherit;
`;

const prompts = [
	'Ringkas email yang belum dibaca hari ini',
	'Cari email penting dari minggu ini',
	'Buat draft balasan untuk email terakhir',
	'Apa saja yang butuh tindakan saya?'
];

export const AiAssistantView = (): React.JSX.Element => {
	const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
	const [input, setInput] = useState('');
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [agentStatus, setAgentStatus] = useState('Connecting...');
	const [isSending, setIsSending] = useState(false);
	const [models, setModels] = useState<ModelOption[]>([
		{ id: 'openrouter/free', name: 'Auto — Free Models Router', free: true }
	]);
	const [selectedModel, setSelectedModel] = useState('openrouter/free');

	useEffect(() => {
		getConversations()
			.then((conversations) => {
				const latest = conversations[0];
				if (!latest) return;
				setActiveConversationId(latest.id);
				setMessages(latest.messages);
				setSelectedModel(latest.model);
			})
			.catch(() => {
				// A new conversation can still be started when history is unavailable.
			});
	}, []);

	useEffect(() => {
		const reset = (): void => {
			setActiveConversationId(null);
			setMessages([]);
		};
		const open = (event: Event): void => {
			const id = (event as CustomEvent<string>).detail;
			getConversation(id)
				.then((conversation) => {
					setActiveConversationId(conversation.id);
					setMessages(conversation.messages);
					setSelectedModel(conversation.model);
				})
				.catch(() => setAgentStatus('Unable to load conversation'));
		};
		window.addEventListener(NEW_CHAT_EVENT, reset);
		window.addEventListener(OPEN_CHAT_EVENT, open);
		return (): void => {
			window.removeEventListener(NEW_CHAT_EVENT, reset);
			window.removeEventListener(OPEN_CHAT_EVENT, open);
		};
	}, []);

	useEffect(() => {
		if (!activeConversationId || messages.length === 0) return;
		const firstPrompt = messages.find((message) => message.role === 'user')?.text;
		const now = Date.now();
		const timeout = window.setTimeout(() => {
			void saveConversation({
				id: activeConversationId,
				title: firstPrompt?.slice(0, 54) || 'Percakapan baru',
				createdAt: now,
				updatedAt: now,
				model: selectedModel,
				messages
			}).catch(() => setAgentStatus('Unable to save history'));
		}, 400);
		return (): void => window.clearTimeout(timeout);
	}, [activeConversationId, messages, selectedModel]);

	useEffect(() => {
		fetch('/api/ai/models')
			.then((response) =>
				parseJsonResponse<{ models: ModelOption[] }>(response)
			)
			.then((data) => {
				if (data.models.length) setModels(data.models);
			})
			.catch(() => {
				// Keep the free auto-router fallback.
			});
	}, []);

	useEffect(() => {
		fetch('/api/ai/health')
			.then((response) => parseJsonResponse<{ mode?: string }>(response))
			.then((data: { mode?: string }) =>
				setAgentStatus(data.mode === 'remote-agent' ? 'Agent connected' : 'Local agent connected')
			)
			.catch(() => setAgentStatus('Agent unavailable'));
	}, []);

	const send = async (value: string): Promise<void> => {
		const prompt = value.trim();
		if (!prompt || isSending) return;
		if (!activeConversationId) setActiveConversationId(createConversationId());
		const userId = Date.now();
		const assistantId = userId + 1;
		setMessages((current) => [
			...current,
			{ id: userId, role: 'user', text: prompt },
			{ id: assistantId, role: 'assistant', text: '' }
		]);
		setInput('');
		setIsSending(true);

		try {
			const response = await fetch('/api/ai/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: prompt, model: selectedModel })
			});
			if (!response.ok || !response.body) {
				throw new Error(`Gateway HTTP ${response.status}`);
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value: chunk } = await reader.read();
				buffer += decoder.decode(chunk ?? new Uint8Array(), { stream: !done });
				const events = buffer.split('\n\n');
				buffer = events.pop() ?? '';

				events.forEach((eventBlock) => {
					const event = eventBlock
						.split('\n')
						.find((line) => line.startsWith('event: '))
						?.slice(7);
					const rawData = eventBlock
						.split('\n')
						.find((line) => line.startsWith('data: '))
						?.slice(6);
					if (!rawData) return;
					const data = JSON.parse(rawData) as {
						text?: string;
						name?: string;
						status?: string;
						count?: number;
						message?: string;
					};
					if (event === 'message' && data.text) {
						setMessages((current) =>
							current.map((message) =>
								message.id === assistantId
									? { ...message, text: message.text + data.text }
									: message
							)
						);
					}
					if (event === 'tool') {
						setAgentStatus(
							data.status === 'running'
								? `Running ${data.name}...`
								: `${data.name}: ${data.count ?? 0} results`
						);
					}
					if (event === 'error') throw new Error(data.message ?? 'Agent error');
				});
				if (done) break;
			}
			setAgentStatus('Agent connected');
		} catch (error) {
			setAgentStatus('Agent error');
			setMessages((current) =>
				current.map((message) =>
					message.id === assistantId
						? {
								...message,
								text: `Tidak bisa menghubungi agent: ${
									error instanceof Error ? error.message : 'Unknown error'
								}`
							}
						: message
				)
			);
		} finally {
			setIsSending(false);
		}
	};

	const submit = (event: FormEvent): void => {
		event.preventDefault();
		void send(input);
	};

	return (
		<Page>
			<Conversation>
				<Header>
					<strong>Carbonio AI</strong>
					<HeaderActions>
						<ModelSelect
							aria-label="AI model"
							value={selectedModel}
							onChange={(event): void => {
								setSelectedModel(event.target.value);
							}}
						>
							{models.map((model) => (
								<option key={model.id} value={model.id}>
									{model.name}
								</option>
							))}
						</ModelSelect>
						<Status>● {agentStatus}</Status>
					</HeaderActions>
				</Header>
				<Messages>
					{messages.length === 0 ? (
						<Empty>
							<Orb>
								<RobotMark size={34} />
							</Orb>
							<h1>Apa yang bisa saya bantu?</h1>
							<p>Tanyakan tentang email, thread, atau minta dibuatkan draft balasan.</p>
							<Suggestions>
								{prompts.map((prompt) => (
									<Suggestion key={prompt} onClick={(): void => void send(prompt)}>
										{prompt}
									</Suggestion>
								))}
							</Suggestions>
						</Empty>
					) : (
						messages.map((message) => (
							<Bubble key={message.id} role={message.role}>
								{message.text}
							</Bubble>
						))
					)}
				</Messages>
				<Composer onSubmit={submit}>
					<Input
						aria-label="Pesan untuk AI Assistant"
						placeholder="Tanyakan sesuatu tentang email Anda..."
						value={input}
						onChange={(event): void => setInput(event.target.value)}
					/>
					<Button
						type="default"
						color="primary"
						icon="PaperPlaneOutline"
						onClick={(): void => void send(input)}
						disabled={!input.trim() || isSending}
					/>
				</Composer>
			</Conversation>
		</Page>
	);
};
