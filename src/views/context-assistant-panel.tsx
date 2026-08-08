import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import styled from '@emotion/styled';
import type { UtilityBarComponentProps } from '@zextras/carbonio-shell-ui';

import { readAgentEvents } from '../api/agent-stream';
import { apiFetch, parseJsonResponse } from '../api/response';
import { RobotMark } from '../components/robot-icon';
import {
	ChatMessage,
	createConversationId,
	saveConversation
} from '../history/chat-history';
import { useAppTranslation } from '../i18n/use-app-translation';
import {
	CarbonioContextReference,
	CarbonioSelection,
	getCarbonioSelection
} from '../utils/carbonio-context';
import { normalizeAssistantDisplayText } from '../utils/plain-text-answer';

const Panel = styled.aside`
	width: 100%;
	height: 100%;
	min-height: 0;
	display: flex;
	flex-direction: column;
	background: ${({ theme }): string => theme.palette.gray6.regular};
	color: ${({ theme }): string => theme.palette.text.regular};
`;

const Header = styled.header`
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.75rem;
	border-bottom: 0.0625rem solid ${({ theme }): string => theme.palette.gray2.regular};
`;

const Title = styled.span`
	flex: 1;
	font-weight: 600;
`;

const IconButton = styled.button`
	border: 0;
	border-radius: 0.375rem;
	background: transparent;
	color: inherit;
	cursor: pointer;
	font: inherit;
`;

const ContextCard = styled.section`
	margin: 0.75rem;
	padding: 0.625rem;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray2.regular};
	border-radius: 0.625rem;
	font-size: 0.8125rem;
`;

const ContextTitle = styled.div`
	font-weight: 600;
	word-break: break-word;
`;

const Disclosure = styled.p`
	margin: 0.375rem 0 0;
	color: ${({ theme }): string => theme.palette.secondary.regular};
	line-height: 1.35;
`;

const Consent = styled.label`
	display: flex;
	align-items: flex-start;
	gap: 0.4rem;
	margin-top: 0.5rem;
	cursor: pointer;
`;

const Actions = styled.div`
	display: grid;
	gap: 0.375rem;
	padding: 0 0.75rem;
`;

const ActionButton = styled.button`
	padding: 0.5rem 0.625rem;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray2.regular};
	border-radius: 0.5rem;
	background: ${({ theme }): string => theme.palette.gray5.regular};
	color: inherit;
	text-align: left;
	cursor: pointer;
	font: inherit;
	font-size: 0.8125rem;

	&:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
`;

const Messages = styled.div`
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	padding: 0.75rem;
`;

const Bubble = styled.div<{ role: ChatMessage['role'] }>`
	align-self: ${({ role }): string => (role === 'user' ? 'flex-end' : 'stretch')};
	max-width: ${({ role }): string => (role === 'user' ? '90%' : '100%')};
	padding: 0.55rem 0.65rem;
	border-radius: 0.625rem;
	background: ${({ role, theme }): string =>
		role === 'user' ? theme.palette.primary.regular : theme.palette.gray5.regular};
	color: ${({ role, theme }): string =>
		role === 'user' ? theme.palette.gray6.regular : theme.palette.text.regular};
	white-space: pre-wrap;
	word-break: break-word;
	font-size: 0.8125rem;
	line-height: 1.4;
`;

const Status = styled.div`
	padding: 0 0.75rem 0.5rem;
	font-size: 0.75rem;
	color: ${({ theme }): string => theme.palette.secondary.regular};
`;

const Composer = styled.form`
	display: flex;
	gap: 0.375rem;
	padding: 0.75rem;
	border-top: 0.0625rem solid ${({ theme }): string => theme.palette.gray2.regular};
`;

const Input = styled.textarea`
	flex: 1;
	min-width: 0;
	min-height: 2.5rem;
	max-height: 6rem;
	resize: vertical;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray2.regular};
	border-radius: 0.5rem;
	padding: 0.5rem;
	background: transparent;
	color: inherit;
	font: inherit;
	font-size: 0.8125rem;
`;

const Send = styled.button`
	align-self: flex-end;
	width: 2.5rem;
	height: 2.5rem;
	border: 0;
	border-radius: 0.5rem;
	background: ${({ theme }): string => theme.palette.primary.regular};
	color: ${({ theme }): string => theme.palette.gray6.regular};
	cursor: pointer;

	&:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
`;

const selectionKey = (selection: CarbonioSelection | null): string =>
	selection ? `${selection.module}:${selection.objectType}:${selection.objectId}:${selection.revision ?? ''}` : '';

export const ContextAssistantPanel = ({
	mode,
	setMode
}: UtilityBarComponentProps): React.JSX.Element | null => {
	const { t, locale } = useAppTranslation();
	const [selection, setSelection] = useState<CarbonioSelection | null>(() =>
		typeof window === 'undefined' ? null : getCarbonioSelection(window.location.href)
	);
	const [includeContext, setIncludeContext] = useState(false);
	const [input, setInput] = useState('');
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [isSending, setIsSending] = useState(false);
	const [status, setStatus] = useState('');
	const [selectedModel, setSelectedModel] = useState('openrouter/free');
	const [conversationId, setConversationId] = useState<string | null>(null);
	const requestControllerRef = useRef<AbortController | null>(null);
	const currentSelectionKey = useMemo(() => selectionKey(selection), [selection]);

	useEffect(() => {
		apiFetch('/api/ai/preferences')
			.then((response) =>
				parseJsonResponse<{ preferences: { preferredModel: string } }>(response)
			)
			.then(({ preferences }) => setSelectedModel(preferences.preferredModel))
			.catch(() => undefined);
	}, []);

	useEffect(() => {
		let previousHref = window.location.href;
		const timer = window.setInterval(() => {
			if (window.location.href === previousHref) return;
			previousHref = window.location.href;
			setSelection(getCarbonioSelection(previousHref));
		}, 350);
		return (): void => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		requestControllerRef.current?.abort();
		setIncludeContext(false);
		setMessages([]);
		setConversationId(null);
		setStatus('');
	}, [currentSelectionKey]);

	useEffect(
		() => (): void => {
			requestControllerRef.current?.abort();
		},
		[]
	);

	if (mode === 'closed') return null;

	const send = async (prompt: string, action = 'ask'): Promise<void> => {
		const cleanPrompt = prompt.trim();
		if (!cleanPrompt || isSending) return;
		const contextReference: CarbonioContextReference | undefined =
			selection && includeContext
				? { ...selection, action, selection: [selection.objectId] }
				: undefined;
		const displayPrompt = contextReference
			? `${contextReference.objectType} #${contextReference.objectId}: ${cleanPrompt}`
			: cleanPrompt;
		const userMessage: ChatMessage = { id: Date.now(), role: 'user', text: displayPrompt };
		const assistantMessage: ChatMessage = {
			id: userMessage.id + 1,
			role: 'assistant',
			text: ''
		};
		const baseMessages = [...messages, userMessage, assistantMessage];
		setMessages(baseMessages);
		setInput('');
		setIsSending(true);
		setStatus(t('status.thinking', 'Thinking...'));
		const controller = new AbortController();
		requestControllerRef.current = controller;
		let answer = '';
		try {
			const response = await apiFetch('/api/ai/chat', {
				method: 'POST',
				headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: cleanPrompt,
					model: selectedModel,
					context: contextReference
				}),
				signal: controller.signal
			});
			await readAgentEvents(response, (event) => {
				if (event.event === 'tool') {
					setStatus(t('context.refetching', 'Reading the selected item securely...'));
					return;
				}
				if (event.event === 'confirmation') {
					answer = t(
						'context.open_full_for_write',
						'Open the full assistant to review and confirm write actions.'
					);
					return;
				}
				if (event.event === 'message' && event.data.text) {
					answer += event.data.text;
					setMessages((current) =>
						current.map((message) =>
							message.id === assistantMessage.id ? { ...message, text: answer } : message
						)
					);
				}
			});
			if (!answer) throw new Error(t('status.empty_answer', 'The agent returned an empty answer'));
			const finalizedMessages = baseMessages.map((message) =>
				message.id === assistantMessage.id ? { ...message, text: answer } : message
			);
			const nextConversationId = conversationId ?? createConversationId();
			setConversationId(nextConversationId);
			await saveConversation({
				id: nextConversationId,
				title: displayPrompt.slice(0, 54),
				createdAt: Date.now(),
				updatedAt: Date.now(),
				model: selectedModel,
				messages: finalizedMessages
			});
			setStatus('');
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') return;
			answer = t('status.contact_error', 'Unable to contact the agent: {{message}}', {
				message: error instanceof Error ? error.message : 'Unknown error'
			});
			setMessages((current) =>
				current.map((message) =>
					message.id === assistantMessage.id ? { ...message, text: answer } : message
				)
			);
			setStatus('');
		} finally {
			if (requestControllerRef.current === controller) requestControllerRef.current = null;
			setIsSending(false);
		}
	};

	const contextualActions = selection?.module === 'calendar'
		? [
				{
					action: 'meeting_prep',
					label: t('context.meeting_prep', 'Prepare me for this meeting'),
					prompt: t('context.meeting_prep_prompt', 'Prepare a concise briefing for this meeting.')
				},
				{
					action: 'action_items',
					label: t('context.follow_up', 'Suggest follow-up actions'),
					prompt: t('context.follow_up_prompt', 'Suggest concise follow-up actions for this meeting.')
				}
			]
		: [
				{
					action: 'summarize',
					label: t('context.summarize', 'Summarize selected email'),
					prompt: t('context.summarize_prompt', 'Summarize this selected email concisely.')
				},
				{
					action: 'action_items',
					label: t('context.action_items', 'Extract action items'),
					prompt: t('context.action_items_prompt', 'Extract action items from this selected email.')
				},
				{
					action: 'draft_reply',
					label: t('context.draft_reply', 'Draft a reply'),
					prompt: t('context.draft_reply_prompt', 'Draft a concise reply to this selected email.')
				}
			];

	const submit = (event: FormEvent): void => {
		event.preventDefault();
		void send(input, 'ask');
	};

	return (
		<Panel aria-label={t('context.panel_title', 'AI context panel')}>
			<Header>
				<RobotMark size={22} />
				<Title>{t('app.name', 'AI Assistant')}</Title>
				<IconButton
					type="button"
					aria-label={t('context.close', 'Close AI panel')}
					onClick={(): void => setMode('closed')}
				>
					×
				</IconButton>
			</Header>
			<ContextCard>
				<ContextTitle>
					{selection
						? t('context.selected_item', 'Selected {{type}} #{{id}}', {
								type: selection.objectType,
								id: selection.objectId
							})
						: t('context.no_selection', 'Open an email or calendar event to use context.')}
				</ContextTitle>
				{selection ? (
					<>
						<Consent>
							<input
								type="checkbox"
								checked={includeContext}
								onChange={(event): void => setIncludeContext(event.target.checked)}
							/>
							<span>{t('context.include_selected', 'Use this selected item')}</span>
						</Consent>
						<Disclosure>
							{t(
								'context.privacy',
								'The item is read server-side only after you run an action. Changing selection cancels the request.'
							)}
						</Disclosure>
					</>
				) : null}
			</ContextCard>
			{selection ? (
				<Actions>
					{contextualActions.map((item) => (
						<ActionButton
							key={item.action}
							type="button"
							disabled={!includeContext || isSending}
							onClick={(): void => void send(item.prompt, item.action)}
						>
							{item.label}
						</ActionButton>
					))}
				</Actions>
			) : null}
			<Messages aria-live="polite">
				{messages.map((message) => (
					<Bubble key={message.id} role={message.role}>
						{message.role === 'assistant'
							? normalizeAssistantDisplayText(message.text, locale)
							: message.text}
					</Bubble>
				))}
			</Messages>
			{status ? <Status>{status}</Status> : null}
			<Composer onSubmit={submit}>
				<Input
					aria-label={t('chat.message_label', 'Message for AI Assistant')}
					placeholder={t('chat.placeholder', 'Ask something about your email...')}
					value={input}
					onChange={(event): void => setInput(event.target.value)}
				/>
				<Send
					type="submit"
					aria-label={t('chat.send', 'Send message')}
					disabled={!input.trim() || isSending}
				>
					➤
				</Send>
			</Composer>
		</Panel>
	);
};
