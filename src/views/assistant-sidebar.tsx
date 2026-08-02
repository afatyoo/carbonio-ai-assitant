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
	StoredConversationSummary,
	deleteConversation,
	getConversationPage,
	renameConversation,
	restoreConversation
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

const HistorySearch = styled.input`
	box-sizing: border-box;
	width: calc(100% - 0.75rem);
	height: 2rem;
	margin: 0 0.375rem 0.5rem;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray3.regular};
	border-radius: 0.625rem;
	padding: 0 0.625rem;
	background: ${({ theme }): string => theme.palette.gray5.regular};
	color: inherit;
	font: inherit;
	font-size: 0.8rem;
	outline: none;

	&:focus {
		border-color: ${({ theme }): string => theme.palette.primary.regular};
	}
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
	display: flex;
	align-items: center;
	gap: 0.125rem;
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

const SkeletonRow = styled.div`
	height: 2.5rem;
	margin-bottom: 0.125rem;
	border-radius: 0.75rem;
	background: ${({ theme }): string => theme.palette.gray4.regular};
	animation: history-pulse 1.2s ease-in-out infinite alternate;

	@keyframes history-pulse {
		from {
			opacity: 0.45;
		}
		to {
			opacity: 0.85;
		}
	}
`;

const LoadMore = styled.button`
	margin: 0.5rem 0.375rem;
	border: 0;
	border-radius: 0.5rem;
	padding: 0.5rem;
	background: transparent;
	color: ${({ theme }): string => theme.palette.primary.regular};
	font: inherit;
	font-size: 0.8rem;
	cursor: pointer;

	&:hover,
	&:focus-visible {
		background: ${({ theme }): string => theme.palette.gray4.regular};
		outline: none;
	}

	&:disabled {
		opacity: 0.55;
		cursor: default;
	}
`;

const UndoNotice = styled.div`
	margin: 0.625rem 0.25rem 0;
	padding: 0.625rem 0.75rem;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	border-radius: 0.625rem;
	background: ${({ theme }): string => theme.palette.gray1.regular};
	color: ${({ theme }): string => theme.palette.gray6.regular};
	font-size: 0.75rem;
`;

const UndoButton = styled.button`
	border: 0;
	padding: 0.25rem;
	background: transparent;
	color: ${({ theme }): string => theme.palette.primary.regular};
	font: inherit;
	font-size: 0.75rem;
	font-weight: 700;
	cursor: pointer;
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
	const [conversations, setConversations] = useState<StoredConversationSummary[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState('');
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState('');
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [deletedNotice, setDeletedNotice] = useState<StoredConversation | null>(null);
	const [searchInput, setSearchInput] = useState('');
	const [searchQuery, setSearchQuery] = useState('');

	const refresh = useCallback((): void => {
		setLoading(true);
		void getConversationPage('', 20, searchQuery)
			.then((page) => {
				setConversations(page.conversations);
				setNextCursor(page.nextCursor);
				setActiveId((current) => current ?? page.conversations[0]?.id ?? null);
				setError('');
			})
			.catch(() => {
				setConversations([]);
				setNextCursor(null);
				setError(t('sidebar.load_error', 'Unable to load conversation history'));
			})
			.finally(() => setLoading(false));
	}, [searchQuery, t]);

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

	useEffect(() => {
		const timeout = window.setTimeout(() => setSearchQuery(searchInput.trim()), 250);
		return (): void => window.clearTimeout(timeout);
	}, [searchInput]);

	useEffect(() => {
		if (!deletedNotice) return;
		const timeout = window.setTimeout(() => setDeletedNotice(null), 8000);
		return (): void => window.clearTimeout(timeout);
	}, [deletedNotice]);

	const loadMore = async (): Promise<void> => {
		if (!nextCursor || loadingMore) return;
		setLoadingMore(true);
		try {
			const page = await getConversationPage(nextCursor, 20, searchQuery);
			setConversations((current) => {
				const known = new Set(current.map(({ id }) => id));
				return [...current, ...page.conversations.filter(({ id }) => !known.has(id))];
			});
			setNextCursor(page.nextCursor);
			setError('');
		} catch {
			setError(t('sidebar.load_more_error', 'Unable to load more conversations'));
		} finally {
			setLoadingMore(false);
		}
	};

	const openConversation = (id: string): void => {
		setActiveId(id);
		window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: id }));
	};

	const startRename = (conversation: StoredConversationSummary): void => {
		setEditingId(conversation.id);
		setRenameValue(conversation.title);
		setMenuOpenId(null);
		setError('');
	};

	const cancelRename = (): void => {
		setEditingId(null);
		setRenameValue('');
	};

	const commitRename = async (conversation: StoredConversationSummary): Promise<void> => {
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

	const removeConversation = async (conversation: StoredConversationSummary): Promise<void> => {
		const confirmed = window.confirm(
			t('sidebar.delete_confirm', 'Delete "{{title}}"? This action cannot be undone.', {
				title: conversation.title
			})
		);
		if (!confirmed) return;
		setMenuOpenId(null);
		setBusyId(conversation.id);
		try {
			const deleted = await deleteConversation(conversation.id);
			setConversations((current) => current.filter((item) => item.id !== conversation.id));
			setDeletedNotice(deleted);
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

	const undoDelete = async (): Promise<void> => {
		if (!deletedNotice) return;
		const conversation = deletedNotice;
		setBusyId(conversation.id);
		try {
			await restoreConversation(conversation.id);
			setDeletedNotice(null);
			refresh();
			setError('');
		} catch {
			setError(t('sidebar.restore_error', 'Unable to restore the conversation'));
		} finally {
			setBusyId(null);
		}
	};

	const onRenameKeyDown = (
		event: KeyboardEvent<HTMLInputElement>,
		_conversation: StoredConversationSummary
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
				<HistorySearch
					type="search"
					aria-label={t('sidebar.search', 'Search conversations')}
					placeholder={t('sidebar.search_placeholder', 'Search history')}
					value={searchInput}
					onChange={(event): void => setSearchInput(event.target.value)}
				/>
				{loading ? (
					<HistoryList aria-label={t('sidebar.loading', 'Loading conversations')}>
						<SkeletonRow />
						<SkeletonRow />
						<SkeletonRow />
					</HistoryList>
				) : conversations.length === 0 ? (
					<EmptyHistory>
						{searchQuery
							? t('sidebar.no_results', 'No conversations found')
							: t('sidebar.empty', 'Your conversations will appear here')}
					</EmptyHistory>
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
											<Button
												type="ghost"
												color="text"
												size="small"
												icon="Trash2Outline"
												disabled={busyId === conversation.id}
												aria-label={t(
													'sidebar.delete_conversation',
													'Delete {{title}}',
													{ title: conversation.title }
												)}
												onClick={(event): void => {
													event.stopPropagation();
													void removeConversation(conversation);
												}}
											/>
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
						{nextCursor && (
							<LoadMore
								type="button"
								disabled={loadingMore}
								onClick={(): void => void loadMore()}
							>
								{loadingMore
									? t('sidebar.loading_more', 'Loading...')
									: t('sidebar.load_more', 'Load more')}
							</LoadMore>
						)}
					</HistoryList>
				)}
				{error && <ErrorMessage role="alert">{error}</ErrorMessage>}
				{deletedNotice && (
					<UndoNotice role="status">
						<span>{t('sidebar.deleted', 'Conversation deleted')}</span>
						<UndoButton type="button" onClick={(): void => void undoDelete()}>
							{t('sidebar.undo', 'Undo')}
						</UndoButton>
					</UndoNotice>
				)}
			</HistorySection>
		</Sidebar>
	);
};
