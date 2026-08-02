import React, { FormEvent, useEffect, useState } from 'react';

import styled from '@emotion/styled';

import { apiFetch, parseJsonResponse } from '../api/response';
import { useAppTranslation } from '../i18n/use-app-translation';

type PublicConfig = {
	provider: string;
	agentUrl: string;
	hasApiKey: boolean;
	model: string;
	mode: 'local-agent' | 'remote-agent';
};

const providers = {
	openrouter: {
		label: 'OpenRouter',
		endpoint: 'https://openrouter.ai/api/v1',
		model: 'openrouter/free'
	},
	openai: {
		label: 'OpenAI / ChatGPT',
		endpoint: 'https://api.openai.com/v1',
		model: 'gpt-5.4-mini'
	},
	anthropic: {
		label: 'Anthropic Claude',
		endpoint: 'https://api.anthropic.com/v1/messages',
		model: 'claude-sonnet-4-6'
	},
	deepseek: {
		label: 'DeepSeek',
		endpoint: 'https://api.deepseek.com',
		model: 'deepseek-v4-flash'
	},
	gemini: {
		label: 'Google Gemini',
		endpoint: 'https://generativelanguage.googleapis.com/v1beta',
		model: 'gemini-3.5-flash'
	},
	custom: {
		label: 'Custom endpoint',
		endpoint: '',
		model: ''
	}
} as const;

const Page = styled.div`
	width: 100%;
	max-width: 52rem;
	padding: 2rem 2.5rem 4rem;
	color: ${({ theme }): string => theme.palette.text.regular};
`;

const Card = styled.form`
	margin-top: 1.5rem;
	padding: 1.5rem;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray3.regular};
	border-radius: 0.75rem;
	background: ${({ theme }): string => theme.palette.gray6.regular};
`;

const Field = styled.label`
	display: block;
	margin-bottom: 1.25rem;
	font-weight: 500;
`;

const Hint = styled.span`
	display: block;
	margin-top: 0.35rem;
	font-size: 0.8rem;
	font-weight: 400;
	color: ${({ theme }): string => theme.palette.secondary.regular};
`;

const Input = styled.input`
	box-sizing: border-box;
	width: 100%;
	margin-top: 0.5rem;
	padding: 0.75rem 0.875rem;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray2.regular};
	border-radius: 0.5rem;
	outline: none;
	background: ${({ theme }): string => theme.palette.gray5.regular};
	color: inherit;
	font: inherit;

	&:focus {
		border-color: ${({ theme }): string => theme.palette.primary.regular};
	}
`;

const Select = styled.select`
	box-sizing: border-box;
	width: 100%;
	margin-top: 0.5rem;
	padding: 0.75rem 0.875rem;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray2.regular};
	border-radius: 0.5rem;
	background: ${({ theme }): string => theme.palette.gray5.regular};
	color: inherit;
	font: inherit;
`;

const Actions = styled.div`
	display: flex;
	align-items: center;
	gap: 1rem;
`;

const Save = styled.button`
	border: 0;
	border-radius: 0.5rem;
	padding: 0.7rem 1.1rem;
	background: ${({ theme }): string => theme.palette.primary.regular};
	color: white;
	font-weight: 500;
	cursor: pointer;

	&:disabled {
		opacity: 0.55;
		cursor: default;
	}
`;

const Status = styled.span<{ error?: boolean }>`
	font-size: 0.85rem;
	color: ${({ error, theme }): string =>
		error ? theme.palette.error.regular : theme.palette.success.regular};
`;

export const AiSettingsView = (): React.JSX.Element => {
	const { t } = useAppTranslation();
	const [provider, setProvider] = useState<keyof typeof providers>('openrouter');
	const [agentUrl, setAgentUrl] = useState('');
	const [apiKey, setApiKey] = useState('');
	const [model, setModel] = useState('~openai/gpt-latest');
	const [hasApiKey, setHasApiKey] = useState(false);
	const [status, setStatus] = useState(() =>
		t('settings.loading', 'Loading configuration...')
	);
	const [error, setError] = useState(false);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		apiFetch('/api/ai/config')
			.then((response) => parseJsonResponse<PublicConfig>(response))
			.then((config) => {
				setProvider((config.provider as keyof typeof providers) || 'custom');
				setAgentUrl(config.agentUrl);
				setHasApiKey(config.hasApiKey);
				setModel(config.model || '~openai/gpt-latest');
				setStatus(
					config.mode === 'remote-agent'
						? t('settings.remote_configured', 'Remote agent configured')
						: t('settings.local_mode', 'Local agent mode')
				);
			})
			.catch((reason: Error) => {
				setError(true);
				setStatus(reason.message);
			});
	}, [t]);

	const save = async (event: FormEvent): Promise<void> => {
		event.preventDefault();
		setSaving(true);
		setError(false);
		setStatus(t('settings.saving', 'Saving...'));
		try {
			const response = await apiFetch('/api/ai/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					provider,
					agentUrl,
					model,
					...(apiKey.trim() ? { apiKey } : {})
				})
			});
			const data = await parseJsonResponse<PublicConfig>(response);
			setHasApiKey(data.hasApiKey);
			setApiKey('');
			setStatus(
				data.mode === 'remote-agent'
					? t('settings.saved_remote', 'Saved — remote agent active')
					: t('settings.saved_local', 'Saved — local mode')
			);
		} catch (reason) {
			setError(true);
			setStatus(
				reason instanceof Error
					? reason.message
					: t('settings.save_error', 'Unable to save')
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Page>
			<h1>{t('app.name', 'AI Assistant')}</h1>
			<p>{t('settings.description', 'Configure the Agent API used by Carbonio AI Assistant.')}</p>
			<Card onSubmit={(event): void => void save(event)}>
				<Field>
					{t('settings.provider', 'AI provider')}
					<Select
						value={provider}
						onChange={(event): void => {
							const nextProvider = event.target.value as keyof typeof providers;
							setProvider(nextProvider);
							setAgentUrl(providers[nextProvider].endpoint);
							setModel(providers[nextProvider].model);
							setApiKey('');
							setHasApiKey(false);
						}}
					>
						{Object.entries(providers).map(([id, item]) => (
							<option key={id} value={id}>
								{id === 'custom'
									? t('settings.custom_provider', 'Custom endpoint')
									: item.label}
							</option>
						))}
					</Select>
					<Hint>
						{t(
							'settings.provider_hint',
							'The endpoint and protocol are configured automatically.'
						)}
					</Hint>
				</Field>
				{provider === 'custom' ? (
					<Field>
						{t('settings.custom_endpoint', 'Custom endpoint')}
						<Input
							type="url"
							placeholder="https://agent.example.com/chat"
							value={agentUrl}
							onChange={(event): void => setAgentUrl(event.target.value)}
						/>
					</Field>
				) : (
					<Field>
						{t('settings.endpoint', 'Endpoint')}
						<Input type="url" value={agentUrl} readOnly />
					</Field>
				)}
				<Field>
					{t('settings.model', 'Model')}
					<Input
						type="text"
						placeholder="~openai/gpt-latest"
						value={model}
						onChange={(event): void => setModel(event.target.value)}
					/>
					<Hint>
						{t(
							'settings.model_hint',
							'Provider model ID. A recommended default is filled automatically.'
						)}
					</Hint>
				</Field>
				<Field>
					{t('settings.api_key', 'API key')}
					<Input
						type="password"
						autoComplete="new-password"
						placeholder={
							hasApiKey
								? t(
										'settings.api_key_configured',
										'Configured — enter a new key to replace it'
									)
								: t('settings.api_key_placeholder', 'Enter API key')
						}
						value={apiKey}
						onChange={(event): void => setApiKey(event.target.value)}
					/>
					<Hint>
						{t(
							'settings.api_key_hint',
							'The current key is never returned to the browser.'
						)}
					</Hint>
				</Field>
				<Actions>
					<Save type="submit" disabled={saving}>
						{saving
							? t('settings.saving', 'Saving...')
							: t('settings.save', 'Save configuration')}
					</Save>
					<Status error={error}>{status}</Status>
				</Actions>
			</Card>
		</Page>
	);
};
