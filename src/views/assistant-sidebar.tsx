import React, { KeyboardEvent, useCallback, useEffect, useState } from 'react';

import styled from '@emotion/styled';
import { Button, Dropdown, DropdownItem } from '@zextras/carbonio-design-system';
import { SecondaryBarComponentProps } from '@zextras/carbonio-shell-ui';

import { RobotMark } from '../components/robot-icon';
import {
	HISTORY_CHANGED_EVENT,
	NEW_CHAT_EVENT,
	OPEN_CHAT_EVENT,
	StoredConversation,
	deleteConversation,
	getConversations,
	renameConversation
} from '../history/chat-history';
import { useAppTranslation } from '../i18n/use-app-translation';

const Sidebar = styled.aside`
	box-sizing: border-box;
	width: 100%;
	height: 100%;
	min-height: 0;
	padding: 1.25rem 0.625rem;
	display: flex;
	flex-direction: column;
	color: ${({ theme }): string => theme.palette.text.regular};
`;

const Brand = styled.div`
	display: flex;
	align-items: center;
	gap: 0.625rem;
	font-size: 1.1rem;
	font-weight: 700;
	margin: 0.25rem 0.625rem 1.25rem;
	white-space: nowrap;
`;

const NewChat = styled.button`
	width: 100%;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray2.regular};
	border-radius: 0.75rem;
	padding: 0.75rem 0.875rem;
	background: transparent;
	color: inherit;
	font: inherit;
	font-weight: 500;
	text-align: left;
	white-space: nowrap;
	cursor: pointer;
	transition: background-color 120ms ease, border-color 120ms ease;

	&:hover,
	&:focus-visible {
		border-color: ${({ theme }): string => theme.palette.primary.regular};
		background: ${({ theme }): string => theme.palette.gray5.regular};
		outline: none;
	}
`;

const HistorySection = styled.div`
	min-height: 0;
	display: flex;
	flex: 1;
	flex-direction: column;
`;

const HistoryLabel = styled.div`
	margin: 1.5rem 0.625rem 0.5rem;
	font-size: 0.75rem;
	font-weight: 700;
	color: ${({ theme }): string => theme.palette.secondary.regular};
`;

const HistoryList = styled.div`
	min-height: 0;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
`;

const HistoryRow = styled.div<{ active: boolean }>`
	min-height: 2.5rem;
	display: flex;
	align-items: center;
	gap: 0.125rem;
	padding: 0.125rem 0.25rem 0.125rem 0.375rem;
	border-radius: 0.75rem;
	background: ${({ active, theme }): string =>
		active ? theme.palette.gray4.regular : 'transparent'};
	transition: background-color 120ms ease;

	&:hover,
	&:focus-within {
		background: ${({ theme }): string => theme.palette.gray4.regular};
	}

	&:hover [data-history-actions='true'],
	&:focus-within [data-history-actions='true'] {
		opacity: 1;
		pointer-events: auto;
	}
`;

const HistoryOpenButton = styled.button`
	min-width: 0;
	min-height: 2.25rem;
	flex: 1;
	border: 0;
	padding: 0 0.375rem;
	background: transparent;
	color: inherit;
	font: inherit;
	text-align: left;
	cursor: pointer;

	&:focus-visible {
		outline: 0.125rem solid ${({ theme }): string => theme.palette.primary.regular};
		outline-offset: -0.125rem;
		border-radius: 0.5rem;
	}
`;

const HistoryTitle = styled.div`
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.875rem;
	line-height: 1.25rem;
`;

const HistoryActions = styled.div<{ open: boolean }>`
	flex: 0 0 auto;
	opacity: ${({ open }): number => (open ? 1 : 0)};
	pointer-events: ${({ open }): string => (open ? 'auto' : 'none')};
	transition: opacity 120ms ease;
`;

const RenameInput = styled.input`
	min-width: 0;
	height: 2rem;
	flex: 1;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.primary.regular};
	border-radius: 0.5rem;
	padding: 0 0.5rem;
	background: ${({ theme }): string => theme.palette.gray6.regular};
	color: inherit;
	font: inherit;
	font-size: 0.875rem;
	outline: none;
`;

const EmptyHistory = styled.p`
	margin: 0.75rem 0.625rem;
	font-size: 0.8rem;
	line-height: 1.3rem;
	color: ${({ theme }): string => theme.palette.secondary.regular};
`;

const ErrorMessage = styled.p`
	margin: 0.5rem 0.625rem 0;
	font-size: 0.75rem;
	color: ${({ theme }): string => theme.palette.error.regular};
`;

const Collapsed = styled.div`
	width: 3rem;
	height: 3rem;
	display: grid;
	place-content: center;
	color: ${({ theme }): string => theme.palette.primary.regular};
`;

export const AssistantSidebar = ({
	expanded
}: SecondaryBarComponentProps): React.JSX.Element => {
	const { t } = useAppTranslation();
	const [conversations, setConversations] = useState<StoredConversation[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState('');
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState('');

	const refresh = useCallback((): void => {
		void getConversations()
			.then((items) => {
				setConversations(items);
				setActiveId((current) => current ?? items[0]?.id ?? null);
				setError('');
			})
			.catch(() => {
				setConversations([]);
				setError(t('sidebar.load_error', 'Unable to load conversation history'));
			});
	}, [t]);

	useEffect(() => {
		const reset = (): void => setActiveId(null);
		refresh();
		window.addEventListener(HISTORY_CHANGED_EVENT, refresh);
		window.addEventListener(NEW_CHAT_EVENT, reset);
		return (): void => {
			window.removeEventListener(HISTORY_CHANGED_EVENT, refresh);
			window.removeEventListener(NEW_CHAT_EVENT, reset);
		};
	}, [refresh]);

	const openConversation = (id: string): void => {
		setActiveId(id);
		window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: id }));
	};

	const startRename = (conversation: StoredConversation): void => {
		setEditingId(conversation.id);
		setRenameValue(conversation.title);
		setMenuOpenId(null);
		setError('');
	};

	const cancelRename = (): void => {
		setEditingId(null);
		setRenameValue('');
	};

	const commitRename = async (conversation: StoredConversation): Promise<void> => {
		const title = renameValue.trim();
		if (!title || title === conversation.title) {
			cancelRename();
			return;
		}
		setEditingId(null);
		setBusyId(conversation.id);
		try {
			const saved = await renameConversation(conversation.id, title);
			setConversations((current) =>
				current.map((item) => (item.id === saved.id ? { ...item, title: saved.title } : item))
			);
			setError('');
		} catch {
			setError(t('sidebar.rename_error', 'Unable to rename the conversation'));
		} finally {
			setBusyId(null);
			setRenameValue('');
		}
	};

	const removeConversation = async (conversation: StoredConversation): Promise<void> => {
		const confirmed = window.confirm(
			t('sidebar.delete_confirm', 'Delete "{{title}}"? This action cannot be undone.', {
				title: conversation.title
			})
		);
		if (!confirmed) return;
		setMenuOpenId(null);
		setBusyId(conversation.id);
		try {
			await deleteConversation(conversation.id);
			setConversations((current) => current.filter((item) => item.id !== conversation.id));
			if (activeId === conversation.id) {
				setActiveId(null);
				window.dispatchEvent(new Event(NEW_CHAT_EVENT));
			}
			setError('');
		} catch {
			setError(t('sidebar.delete_error', 'Unable to delete the conversation'));
		} finally {
			setBusyId(null);
		}
	};

	const onRenameKeyDown = (
		event: KeyboardEvent<HTMLInputElement>,
		conversation: StoredConversation
	): void => {
		if (event.key === 'Enter') {
			event.preventDefault();
			event.currentTarget.blur();
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			cancelRename();
		}
	};

	if (!expanded) {
		return (
			<Collapsed>
				<RobotMark size={22} />
			</Collapsed>
		);
	}

	return (
		<Sidebar>
			<Brand>
				<RobotMark />
				{t('app.name', 'AI Assistant')}
			</Brand>
			<NewChat
				onClick={(): void => {
					setActiveId(null);
					window.dispatchEvent(new Event(NEW_CHAT_EVENT));
				}}
			>
				＋ {t('sidebar.new_chat', 'New chat')}
			</NewChat>
			<HistorySection>
				<HistoryLabel>{t('sidebar.recent', 'Recent')}</HistoryLabel>
				{conversations.length === 0 ? (
					<EmptyHistory>{t('sidebar.empty', 'Your conversations will appear here')}</EmptyHistory>
				) : (
					<HistoryList>
						{conversations.map((conversation) => {
							const actions: DropdownItem[] = [
								{
									id: `rename-${conversation.id}`,
									icon: 'Edit2Outline',
									label: t('sidebar.rename', 'Rename'),
									onClick: (event): void => {
										event.stopPropagation();
										startRename(conversation);
									}
								},
								{
									id: `delete-${conversation.id}`,
									icon: 'Trash2Outline',
									label: t('sidebar.delete', 'Delete'),
									onClick: (event): void => {
										event.stopPropagation();
										void removeConversation(conversation);
									}
								}
							];
							const editing = editingId === conversation.id;
							const menuOpen = menuOpenId === conversation.id;
							return (
								<HistoryRow
									key={conversation.id}
									active={conversation.id === activeId}
									aria-busy={busyId === conversation.id}
								>
									{editing ? (
										<RenameInput
											autoFocus
											aria-label={t('sidebar.rename_prompt', 'Rename conversation')}
											value={renameValue}
											onChange={(event): void => setRenameValue(event.target.value)}
											onKeyDown={(event): void => onRenameKeyDown(event, conversation)}
											onBlur={(): void => void commitRename(conversation)}
										/>
									) : (
										<HistoryOpenButton
											type="button"
											title={conversation.title}
											onClick={(): void => openConversation(conversation.id)}
										>
											<HistoryTitle>{conversation.title}</HistoryTitle>
										</HistoryOpenButton>
									)}
									{!editing && (
										<HistoryActions data-history-actions="true" open={menuOpen}>
											<Dropdown
												items={actions}
												placement="bottom-end"
												onOpen={(): void => setMenuOpenId(conversation.id)}
												onClose={(): void => setMenuOpenId(null)}
											>
												<Button
													type="ghost"
													color="text"
													size="small"
													icon="MoreVertical"
													aria-label={t(
														'sidebar.more_actions',
														'More actions for {{title}}',
														{ title: conversation.title }
													)}
													onClick={(event): void => event.stopPropagation()}
												/>
											</Dropdown>
										</HistoryActions>
									)}
								</HistoryRow>
							);
						})}
					</HistoryList>
				)}
				{error && <ErrorMessage role="alert">{error}</ErrorMessage>}
			</HistorySection>
		</Sidebar>
	);
};
