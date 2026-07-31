import React, { FormEvent, useMemo, useState } from 'react';

import styled from '@emotion/styled';
import { Button, Icon } from '@zextras/carbonio-design-system';

type ChatMessage = {
	id: number;
	role: 'assistant' | 'user';
	text: string;
};

const Page = styled.div`
	height: 100%;
	min-height: 0;
	display: flex;
	background: ${({ theme }): string => theme.palette.gray6.regular};
	color: ${({ theme }): string => theme.palette.text.regular};
`;

const History = styled.aside`
	width: 16rem;
	padding: 1.25rem 0.875rem;
	border-right: 0.0625rem solid ${({ theme }): string => theme.palette.gray3.regular};
	background: ${({ theme }): string => theme.palette.gray5.regular};
`;

const Brand = styled.div`
	display: flex;
	align-items: center;
	gap: 0.625rem;
	font-size: 1.1rem;
	font-weight: 700;
	margin: 0.25rem 0.5rem 1.5rem;
`;

const NewChat = styled.button`
	width: 100%;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray2.regular};
	border-radius: 0.625rem;
	padding: 0.75rem;
	background: transparent;
	color: inherit;
	text-align: left;
	cursor: pointer;
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

const mockReply = (prompt: string): string => {
	const normalized = prompt.toLowerCase();
	if (normalized.includes('belum dibaca') || normalized.includes('ringkas')) {
		return 'Mode demo aktif. Saya menemukan 3 email belum dibaca untuk diringkas. Setelah Agent API dihubungkan, hasil asli akan tampil di sini lengkap dengan pengirim, subjek, dan tindakan yang disarankan.';
	}
	if (normalized.includes('draft') || normalized.includes('balas')) {
		return 'Siap. Pada versi Agent API, saya akan membaca email yang dipilih lalu membuat draft. Email tidak akan dikirim sebelum Anda menyetujuinya.';
	}
	return 'Pesan diterima dalam mode demo. Koneksi UI add-on sudah bekerja; langkah berikutnya adalah memasang endpoint Agent API dan tool mailbox read-only.';
};

export const AiAssistantView = (): React.JSX.Element => {
	const [input, setInput] = useState('');
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const nextId = useMemo(() => messages.length + 1, [messages.length]);

	const send = (value: string): void => {
		const prompt = value.trim();
		if (!prompt) return;
		setMessages((current) => [
			...current,
			{ id: nextId, role: 'user', text: prompt },
			{ id: nextId + 1, role: 'assistant', text: mockReply(prompt) }
		]);
		setInput('');
	};

	const submit = (event: FormEvent): void => {
		event.preventDefault();
		send(input);
	};

	return (
		<Page>
			<History>
				<Brand>
					<Icon icon="MessageCircleOutline" size="large" color="primary" />
					AI Assistant
				</Brand>
				<NewChat onClick={(): void => setMessages([])}>＋ Percakapan baru</NewChat>
			</History>
			<Conversation>
				<Header>
					<strong>Carbonio AI</strong>
					<Status>● Demo agent connected</Status>
				</Header>
				<Messages>
					{messages.length === 0 ? (
						<Empty>
							<Orb>
								<Icon icon="MessageCircleOutline" size="large" />
							</Orb>
							<h1>Apa yang bisa saya bantu?</h1>
							<p>Tanyakan tentang email, thread, atau minta dibuatkan draft balasan.</p>
							<Suggestions>
								{prompts.map((prompt) => (
									<Suggestion key={prompt} onClick={(): void => send(prompt)}>
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
						onClick={(): void => send(input)}
						disabled={!input.trim()}
					/>
				</Composer>
			</Conversation>
		</Page>
	);
};
