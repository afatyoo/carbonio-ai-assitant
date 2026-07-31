import React, { useEffect, useState } from 'react';

import styled from '@emotion/styled';
import { SecondaryBarComponentProps } from '@zextras/carbonio-shell-ui';

import { RobotMark } from '../components/robot-icon';
import {
	HISTORY_CHANGED_EVENT,
	NEW_CHAT_EVENT,
	OPEN_CHAT_EVENT,
	StoredConversation,
	getConversations
} from '../history/chat-history';

const Sidebar = styled.aside`
	width: 100%;
	min-height: 100%;
	padding: 1.25rem 0.875rem;
	color: ${({ theme }): string => theme.palette.text.regular};
`;

const Brand = styled.div`
	display: flex;
	align-items: center;
	gap: 0.625rem;
	font-size: 1.1rem;
	font-weight: 700;
	margin: 0.25rem 0.5rem 1.5rem;
	white-space: nowrap;
`;

const NewChat = styled.button`
	width: 100%;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray2.regular};
	border-radius: 0.625rem;
	padding: 0.75rem;
	background: transparent;
	color: inherit;
	text-align: left;
	white-space: nowrap;
	cursor: pointer;
`;

const HistoryLabel = styled.div`
	margin: 1.5rem 0.5rem 0.5rem;
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
	color: ${({ theme }): string => theme.palette.secondary.regular};
`;

const HistoryList = styled.div`
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
`;

const HistoryItem = styled.button<{ active: boolean }>`
	width: 100%;
	border: 0;
	border-radius: 0.5rem;
	padding: 0.65rem 0.7rem;
	background: ${({ active, theme }): string =>
		active ? theme.palette.gray4.regular : 'transparent'};
	color: inherit;
	text-align: left;
	cursor: pointer;

	&:hover {
		background: ${({ theme }): string => theme.palette.gray4.regular};
	}
`;

const HistoryTitle = styled.div`
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.85rem;
`;

const HistoryDate = styled.div`
	margin-top: 0.2rem;
	font-size: 0.68rem;
	color: ${({ theme }): string => theme.palette.secondary.regular};
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
	const [conversations, setConversations] = useState<StoredConversation[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);

	useEffect(() => {
		const refresh = (): void => {
			void getConversations()
				.then((items) => {
					setConversations(items);
					setActiveId((current) => current ?? items[0]?.id ?? null);
				})
				.catch(() => setConversations([]));
		};
		const reset = (): void => setActiveId(null);
		refresh();
		window.addEventListener(HISTORY_CHANGED_EVENT, refresh);
		window.addEventListener(NEW_CHAT_EVENT, reset);
		return (): void => {
			window.removeEventListener(HISTORY_CHANGED_EVENT, refresh);
			window.removeEventListener(NEW_CHAT_EVENT, reset);
		};
	}, []);

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
				AI Assistant
			</Brand>
			<NewChat
				onClick={(): void => {
					window.dispatchEvent(new Event(NEW_CHAT_EVENT));
				}}
			>
				＋ Percakapan baru
			</NewChat>
			{conversations.length > 0 && (
				<>
					<HistoryLabel>Riwayat</HistoryLabel>
					<HistoryList>
						{conversations.map((conversation) => (
							<HistoryItem
								key={conversation.id}
								active={conversation.id === activeId}
								onClick={(): void => {
									setActiveId(conversation.id);
									window.dispatchEvent(
										new CustomEvent(OPEN_CHAT_EVENT, { detail: conversation.id })
									);
								}}
							>
								<HistoryTitle>{conversation.title}</HistoryTitle>
								<HistoryDate>
									{new Date(conversation.updatedAt).toLocaleDateString('id-ID', {
										day: 'numeric',
										month: 'short'
									})}
								</HistoryDate>
							</HistoryItem>
						))}
					</HistoryList>
				</>
			)}
		</Sidebar>
	);
};
