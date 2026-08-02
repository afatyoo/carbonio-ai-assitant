import React, { FormEvent, useEffect, useRef, useState } from 'react';

import styled from '@emotion/styled';
import { Button } from '@zextras/carbonio-design-system';

import { AgentEvent, readAgentEvents } from '../api/agent-stream';
import { apiFetch, parseJsonResponse } from '../api/response';
import { RobotMark } from '../components/robot-icon';
import {
	ChatMessage,
	NEW_CHAT_EVENT,
	OPEN_CHAT_EVENT,
	RENAME_CHAT_EVENT,
	createConversationId,
	getConversation,
	getConversations,
	saveConversation
} from '../history/chat-history';
import { useAppTranslation } from '../i18n/use-app-translation';

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

const ProcessMarker = styled.div`
	min-height: 2rem;
	margin: 0 0 1rem;
	padding: 0.35rem 0.25rem;
	display: flex;
	align-items: center;
	gap: 0.55rem;
	color: ${({ theme }): string => theme.palette.secondary.regular};
	font-size: 0.85rem;
	line-height: 1.25rem;
`;

const ProcessSpinner = styled.span`
	box-sizing: border-box;
	width: 0.95rem;
	height: 0.95rem;
	flex: 0 0 auto;
	border: 0.125rem solid ${({ theme }): string => theme.palette.gray3.regular};
	border-top-color: ${({ theme }): string => theme.palette.primary.regular};
	border-radius: 50%;
	animation: process-spin 700ms linear infinite;

	@keyframes process-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		animation-duration: 1.5s;
	}
`;

const ProcessText = styled.span`
	background: linear-gradient(
		90deg,
		${({ theme }): string => theme.palette.secondary.regular} 20%,
		${({ theme }): string => theme.palette.text.regular} 48%,
		${({ theme }): string => theme.palette.secondary.regular} 76%
	);
	background-size: 220% 100%;
	background-clip: text;
	color: transparent;
	animation: process-shimmer 1.6s linear infinite;

	@keyframes process-shimmer {
		to {
			background-position: -220% 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		background: none;
		color: inherit;
		animation: none;
	}
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

export const AiAssistantView = (): React.JSX.Element => {
	const { t } = useAppTranslation();
	const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
	const [conversationTitle, setConversationTitle] = useState<string | null>(null);
	const [input, setInput] = useState('');
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [agentStatus, setAgentStatus] = useState(() =>
		t('status.connecting', 'Connecting...')
	);
	const [isSending, setIsSending] = useState(false);
	const [processLabel, setProcessLabel] = useState('');
	const messagesRef = useRef<HTMLDivElement | null>(null);
	const [models, setModels] = useState<ModelOption[]>([
		{ id: 'openrouter/free', name: 'Auto — Free Models Router', free: true }
	]);
	const [selectedModel, setSelectedModel] = useState('openrouter/free');
	const prompts = [
		t('chat.suggestion.unread', "Summarize today's unread email"),
		t('chat.suggestion.important', 'Find important email from this week'),
		t('chat.suggestion.reply', 'Draft a reply to the latest email'),
		t('chat.suggestion.actions', 'What needs my attention?')
	];

	const toolStatusLabel = (event: AgentEvent): string => {
		if (event.event !== 'tool') return t('status.waiting_ai', 'Waiting for AI...');
		if (event.data.status === 'completed') {
			return t('status.waiting_ai', 'Waiting for AI...');
		}
		switch (event.data.name) {
			case 'search_carbonio_docs':
				return t('status.searching_docs', 'Searching Carbonio documentation...');
			case 'search_emails':
				return t('status.searching_emails', 'Searching emails...');
			case 'list_unread_emails':
				return t('status.reading_unread', 'Reading unread emails...');
			default:
				return t('status.running_tool', 'Running Carbonio tool...');
		}
	};

	useEffect(() => {
		const element = messagesRef.current;
		if (!element) return;
		element.scrollTop = element.scrollHeight;
	}, [messages, processLabel]);

	useEffect(() => {
		getConversations()
			.then((conversations) => {
				const latest = conversations[0];
				return latest ? getConversation(latest.id) : null;
			})
			.then((latest) => {
				if (!latest) return;
				setActiveConversationId(latest.id);
				setConversationTitle(latest.title);
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
			setConversationTitle(null);
			setMessages([]);
		};
		const open = (event: Event): void => {
			const id = (event as CustomEvent<string>).detail;
			getConversation(id)
				.then((conversation) => {
					setActiveConversationId(conversation.id);
					setConversationTitle(conversation.title);
					setMessages(conversation.messages);
					setSelectedModel(conversation.model);
				})
				.catch(() =>
					setAgentStatus(
						t('status.load_conversation_error', 'Unable to load conversation')
					)
				);
		};
		const rename = (event: Event): void => {
			const detail = (event as CustomEvent<{ id: string; title: string }>).detail;
			if (detail.id === activeConversationId) setConversationTitle(detail.title);
		};
		window.addEventListener(NEW_CHAT_EVENT, reset);
		window.addEventListener(OPEN_CHAT_EVENT, open);
		window.addEventListener(RENAME_CHAT_EVENT, rename);
		return (): void => {
			window.removeEventListener(NEW_CHAT_EVENT, reset);
			window.removeEventListener(OPEN_CHAT_EVENT, open);
			window.removeEventListener(RENAME_CHAT_EVENT, rename);
		};
	}, [activeConversationId, t]);

	useEffect(() => {
		if (!activeConversationId || messages.length === 0) return;
		const firstPrompt = messages.find((message) => message.role === 'user')?.text;
		const now = Date.now();
		const timeout = window.setTimeout(() => {
			void saveConversation({
				id: activeConversationId,
				title:
					conversationTitle ??
					firstPrompt?.slice(0, 54) ??
					t('chat.new_conversation', 'New conversation'),
				createdAt: now,
				updatedAt: now,
				model: selectedModel,
				messages
			}).catch(() =>
				setAgentStatus(t('status.save_history_error', 'Unable to save history'))
			);
		}, 400);
		return (): void => window.clearTimeout(timeout);
	}, [activeConversationId, conversationTitle, messages, selectedModel, t]);

	useEffect(() => {
		apiFetch('/api/ai/models')
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
		apiFetch('/api/ai/health')
			.then((response) => parseJsonResponse<{ mode?: string }>(response))
			.then((data: { mode?: string }) =>
				setAgentStatus(
					data.mode === 'remote-agent'
						? t('status.agent_connected', 'Agent connected')
						: t('status.local_agent_connected', 'Local agent connected')
				)
			)
			.catch(() => setAgentStatus(t('status.agent_unavailable', 'Agent unavailable')));
	}, [t]);

	const send = async (value: string): Promise<void> => {
		const prompt = value.trim();
		if (!prompt || isSending) return;
		if (!activeConversationId) {
			setActiveConversationId(createConversationId());
			setConversationTitle(prompt.slice(0, 54));
		}
		const userId = Date.now();
		const assistantId = userId + 1;
		setMessages((current) => [
			...current,
			{ id: userId, role: 'user', text: prompt },
			{ id: assistantId, role: 'assistant', text: '' }
		]);
		setInput('');
		setIsSending(true);
		setProcessLabel(t('status.thinking', 'Thinking...'));

		try {
			const response = await apiFetch('/api/ai/chat', {
				method: 'POST',
				headers: {
					Accept: 'text/event-stream',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ message: prompt, model: selectedModel })
			});
			let answer = '';
			await readAgentEvents(response, (event) => {
				if (event.event === 'tool') {
					setProcessLabel(toolStatusLabel(event));
					return;
				}
				if (event.event === 'message' && event.data.text) {
					answer += event.data.text;
					setProcessLabel(t('status.generating_answer', 'Generating answer...'));
					setMessages((current) =>
						current.map((message) =>
							message.id === assistantId ? { ...message, text: answer } : message
						)
					);
				}
			});
			if (!answer) throw new Error(t('status.empty_answer', 'The agent returned an empty answer'));
			setAgentStatus(t('status.agent_connected', 'Agent connected'));
		} catch (error) {
			setAgentStatus(t('status.agent_error', 'Agent error'));
			setMessages((current) =>
				current.map((message) =>
					message.id === assistantId
						? {
								...message,
								text: t('status.contact_error', 'Unable to contact the agent: {{message}}', {
									message: error instanceof Error ? error.message : 'Unknown error'
								})
							}
						: message
				)
			);
		} finally {
			setIsSending(false);
			setProcessLabel('');
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
					<strong>{t('chat.product_name', 'Carbonio AI')}</strong>
					<HeaderActions>
						<ModelSelect
							aria-label={t('chat.model_label', 'AI model')}
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
				<Messages ref={messagesRef}>
					{messages.length === 0 ? (
						<Empty>
							<Orb>
								<RobotMark size={34} />
							</Orb>
							<h1>{t('chat.headline', 'How can I help?')}</h1>
							<p>
								{t(
									'chat.description',
									'Ask about email or threads, or request a reply draft.'
								)}
							</p>
							<Suggestions>
								{prompts.map((prompt) => (
									<Suggestion key={prompt} onClick={(): void => void send(prompt)}>
										{prompt}
									</Suggestion>
								))}
							</Suggestions>
						</Empty>
					) : (
						messages.map((message) =>
							message.text ? (
								<Bubble key={message.id} role={message.role}>
									{message.text}
								</Bubble>
							) : null
						)
					)}
					{isSending && processLabel && (
						<ProcessMarker role="status" aria-live="polite">
							<ProcessSpinner aria-hidden="true" />
							<ProcessText>{processLabel}</ProcessText>
						</ProcessMarker>
					)}
				</Messages>
				<Composer onSubmit={submit}>
					<Input
						aria-label={t('chat.message_label', 'Message for AI Assistant')}
						placeholder={t('chat.placeholder', 'Ask something about your email...')}
						value={input}
						onChange={(event): void => setInput(event.target.value)}
					/>
					<Button
						type="default"
						color="primary"
						icon="PaperPlaneOutline"
						onClick={(): void => void send(input)}
						disabled={!input.trim() || isSending}
						aria-label={t('chat.send', 'Send message')}
					/>
				</Composer>
			</Conversation>
		</Page>
	);
};
