import React, { FormEvent, useCallback, useEffect, useState } from 'react';

import styled from '@emotion/styled';

import { apiFetch, parseJsonResponse } from '../api/response';
import { useAppTranslation } from '../i18n/use-app-translation';

type PublicConfig = {
	provider: string;
	agentUrl: string;
	hasApiKey: boolean;
	model: string;
	effectiveModel: string;
	effectiveProvider: string;
	fallbackModels: string[];
	zdrEnabled: boolean;
	configRevision: string;
	configSource: Record<'provider' | 'agentUrl' | 'model' | 'fallbackModels' | 'zdrEnabled', 'environment' | 'runtime'>;
	lockedFields: string[];
	mode: 'local-agent' | 'remote-agent';
	modelAllowlist: string[];
	processingDisclosure: string;
	canManageSettings: boolean;
};

type AdminMetrics = {
	metrics: { uptimeSeconds: number; counters: Record<string, number> };
	policy: Record<string, string | number | boolean>;
};

type AccountUsage = {
	date: string;
	requestCount: number;
	requestLimit: number;
	totalTokens: number;
	tokenLimit: number;
};

type AuditEntry = {
	id: string;
	ownerId?: string;
	tool: string;
	risk: string;
	status: string;
	createdAt: number;
	requestId?: string;
	resultReference?: string;
	undoAvailable?: boolean;
};

type OperationalHealth = {
	status: 'healthy' | 'degraded' | 'error';
	components: Record<string, { status: string; detail: string; observedAt: number }>;
	provider: { status: string; model: string; configuredModel: string; usedFallback: boolean; latencyMs: number | null; errorCode: string };
};

type SafetyState = {
	writeToolsEnabled: boolean;
	environmentAllowsWrites: boolean;
	updatedAt: number | null;
};

type RagSource = {
	module: string;
	label: string;
	available: boolean;
	unavailableReason: string;
	enabled: boolean;
	status: string;
	lastSyncAt: number | null;
	indexedDocuments: number;
	indexedChunks: number;
	lastError: string;
	lastSyncStats?: { scanned?: number; changed?: number; unchanged?: number; deleted?: number };
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

const AdminPanel = styled.section`
	margin-top: 1.5rem;
	padding: 1.5rem;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray3.regular};
	border-radius: 0.75rem;
	background: ${({ theme }): string => theme.palette.gray6.regular};
`;

const AdminSummary = styled.pre`
	max-height: 16rem;
	overflow: auto;
	white-space: pre-wrap;
	font-size: 0.78rem;
	color: inherit;
`;

const AuditList = styled.ul`
	margin: 0;
	padding-left: 1.25rem;
	font-size: 0.82rem;
`;

const HealthGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
	gap: 0.75rem;
`;

const HealthCard = styled.div`
	padding: 0.875rem;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray3.regular};
	border-radius: 0.625rem;
`;

const HealthStatus = styled(Status)`
	margin-left: 0.4rem;
`;

const CheckRow = styled.label`
	display: flex;
	gap: 0.65rem;
	align-items: flex-start;
	margin-bottom: 1.25rem;
	font-weight: 500;

	input {
		margin-top: 0.2rem;
		accent-color: ${({ theme }): string => theme.palette.primary.regular};
	}
`;

const AuditRow = styled.li`
	margin-bottom: 0.75rem;
`;

const SourceList = styled.div`
	display: grid;
	gap: 0.75rem;
`;

const SourceRow = styled.div`
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.75rem;
	align-items: center;
	padding: 0.875rem;
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray3.regular};
	border-radius: 0.625rem;
`;

const SourceActions = styled.div`
	display: flex;
	gap: 0.5rem;
	align-items: center;
`;

const SecondaryButton = styled.button`
	border: 0.0625rem solid ${({ theme }): string => theme.palette.gray2.regular};
	border-radius: 0.5rem;
	padding: 0.5rem 0.75rem;
	background: ${({ theme }): string => theme.palette.gray5.regular};
	color: inherit;
	cursor: pointer;

	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
`;

const AdminConsoleLink = styled.a`
	display: inline-flex;
	margin-top: 0.5rem;
	border-radius: 0.5rem;
	padding: 0.65rem 0.9rem;
	background: ${({ theme }): string => theme.palette.primary.regular};
	color: white;
	font-weight: 600;
	text-decoration: none;
`;

type AiSettingsViewProps = {
	administration?: boolean;
};

export const AiSettingsView = ({ administration = false }: AiSettingsViewProps): React.JSX.Element => {
	const { t } = useAppTranslation();
	const [provider, setProvider] = useState<keyof typeof providers>('openrouter');
	const [agentUrl, setAgentUrl] = useState('');
	const [apiKey, setApiKey] = useState('');
	const [model, setModel] = useState('~openai/gpt-latest');
	const [fallbackModels, setFallbackModels] = useState('');
	const [zdrEnabled, setZdrEnabled] = useState(true);
	const [savedZdrEnabled, setSavedZdrEnabled] = useState(true);
	const [hasApiKey, setHasApiKey] = useState(false);
	const [status, setStatus] = useState(() =>
		t('settings.loading', 'Loading configuration...')
	);
	const [error, setError] = useState(false);
	const [saving, setSaving] = useState(false);
	const [canManageSettings, setCanManageSettings] = useState(false);
	const [configLoaded, setConfigLoaded] = useState(false);
	const [modelAllowlist, setModelAllowlist] = useState<string[]>([]);
	const [lockedFields, setLockedFields] = useState<string[]>([]);
	const [processingDisclosure, setProcessingDisclosure] = useState('');
	const [adminMetrics, setAdminMetrics] = useState<AdminMetrics | null>(null);
	const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
	const [userAuditEntries, setUserAuditEntries] = useState<AuditEntry[]>([]);
	const [operationalHealth, setOperationalHealth] = useState<OperationalHealth | null>(null);
	const [safetyState, setSafetyState] = useState<SafetyState | null>(null);
	const [testingProvider, setTestingProvider] = useState(false);
	const [undoBusy, setUndoBusy] = useState<string[]>([]);
	const [accountUsage, setAccountUsage] = useState<AccountUsage | null>(null);
	const [ragSources, setRagSources] = useState<RagSource[]>([]);
	const [ragBusy, setRagBusy] = useState<string[]>([]);
	const [ragStatus, setRagStatus] = useState('');

	const loadSafetyActivity = useCallback((): void => {
		void apiFetch('/api/ai/audit?limit=25')
			.then((response) => parseJsonResponse<{ entries: AuditEntry[] }>(response))
			.then(({ entries }) => setUserAuditEntries(entries))
			.catch(() => {
				// Safety activity remains hidden when unavailable.
			});
	}, []);

	useEffect(() => {
		if (!administration) loadSafetyActivity();
	}, [administration, loadSafetyActivity]);

	const loadRagSources = useCallback((): void => {
		void apiFetch('/api/ai/rag/sources')
			.then((response) => parseJsonResponse<{ sources: RagSource[] }>(response))
			.then(({ sources }) => setRagSources(sources))
			.catch((reason: Error) => setRagStatus(reason.message));
	}, []);

	useEffect(() => {
		if (!administration) loadRagSources();
	}, [administration, loadRagSources]);

	useEffect(() => {
		if (!ragSources.some(({ status: sourceStatus }) => sourceStatus === 'syncing')) return undefined;
		const refreshTimer = window.setTimeout(loadRagSources, 1_500);
		return (): void => window.clearTimeout(refreshTimer);
	}, [loadRagSources, ragSources]);

	const updateRagSource = async (module: string, enabled: boolean): Promise<void> => {
		setRagBusy((current) => [...current, module]);
		setRagStatus('');
		try {
			await parseJsonResponse(
				await apiFetch('/api/ai/rag/sources', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ module, enabled })
				})
			);
			loadRagSources();
		} catch (reason) {
			setRagStatus(reason instanceof Error ? reason.message : t('settings.rag_error', 'Unable to update AI sources'));
		} finally {
			setRagBusy((current) => current.filter((item) => item !== module));
		}
	};

	const syncRagSource = async (module: string): Promise<void> => {
		setRagBusy((current) => [...current, module]);
		setRagStatus(t('settings.rag_sync_started', 'Collecting your data securely...'));
		try {
			const result = await parseJsonResponse<{ queued: number }>(
				await apiFetch('/api/ai/rag/sources/sync', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ module })
				})
			);
			setRagStatus(t('settings.rag_queued', '{{count}} items queued securely', { count: result.queued }));
			loadRagSources();
		} catch (reason) {
			setRagStatus(reason instanceof Error ? reason.message : t('settings.rag_error', 'Unable to update AI sources'));
		} finally {
			setRagBusy((current) => current.filter((item) => item !== module));
		}
	};

	const testProvider = async (): Promise<void> => {
		setTestingProvider(true);
		setError(false);
		setStatus(t('settings.provider_testing', 'Testing the saved provider and model...'));
		try {
			const result = await parseJsonResponse<{
				activeModel: string;
				configuredModel: string;
				usedFallback: boolean;
				latencyMs: number;
			}>(await apiFetch('/api/ai/admin/provider/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model })
			}));
			setStatus(t('settings.provider_test_ok', 'Connection passed with {{model}} in {{latency}} ms{{fallback}}', {
				model: result.activeModel,
				latency: result.latencyMs,
				fallback: result.usedFallback ? t('settings.provider_test_fallback', ' using fallback') : ''
			}));
		} catch (reason) {
			setError(true);
			setStatus(reason instanceof Error ? reason.message : t('settings.provider_test_error', 'Provider connection test failed'));
		} finally {
			setTestingProvider(false);
		}
	};

	const updateSafety = async (writeToolsEnabled: boolean): Promise<void> => {
		setError(false);
		try {
			const { safety } = await parseJsonResponse<{ safety: SafetyState }>(
				await apiFetch('/api/ai/admin/safety', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ writeToolsEnabled })
				})
			);
			setSafetyState(safety);
			setStatus(writeToolsEnabled
				? t('settings.writes_enabled', 'AI write tools enabled')
				: t('settings.writes_disabled', 'Emergency write stop enabled'));
		} catch (reason) {
			setError(true);
			setStatus(reason instanceof Error ? reason.message : t('settings.safety_error', 'Unable to update safety controls'));
		}
	};

	const undoAuditEntry = async (entry: AuditEntry): Promise<void> => {
		setUndoBusy((current) => [...current, entry.id]);
		try {
			const first = await parseJsonResponse<{
				status: string;
				confirmation?: { token: string; preview: Record<string, unknown> };
			}>(await apiFetch(`/api/ai/audit/${encodeURIComponent(entry.id)}/undo`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: '{}'
			}));
			if (first.status !== 'confirmation_required' || !first.confirmation) throw new Error('Undo confirmation was not returned');
			const accepted = window.confirm(
				`${t('settings.undo_confirm', 'Confirm this undo operation')}\n\n${JSON.stringify(first.confirmation.preview, null, 2)}`
			);
			if (!accepted) return;
			await parseJsonResponse(await apiFetch(`/api/ai/audit/${encodeURIComponent(entry.id)}/undo`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ confirmationToken: first.confirmation.token, idempotencyKey: crypto.randomUUID() })
			}));
			setStatus(t('settings.undo_complete', 'Operation undone successfully'));
			loadSafetyActivity();
		} catch (reason) {
			setError(true);
			setStatus(reason instanceof Error ? reason.message : t('settings.undo_error', 'Unable to undo operation'));
		} finally {
			setUndoBusy((current) => current.filter((id) => id !== entry.id));
		}
	};

	useEffect(() => {
		if (administration) return;
		apiFetch('/api/ai/usage')
			.then((response) => parseJsonResponse<{ usage: AccountUsage }>(response))
			.then(({ usage }) => setAccountUsage(usage))
			.catch(() => {
				// Usage remains hidden when the authenticated account cannot load it.
			});
	}, [administration]);

	useEffect(() => {
		apiFetch('/api/ai/config')
			.then((response) => parseJsonResponse<PublicConfig>(response))
			.then((config) => {
				setProvider((config.provider as keyof typeof providers) || 'custom');
				setAgentUrl(config.agentUrl);
				setHasApiKey(config.hasApiKey);
				setModel(config.model || '~openai/gpt-latest');
				setFallbackModels((config.fallbackModels ?? []).join(', '));
				setZdrEnabled(config.zdrEnabled !== false);
				setSavedZdrEnabled(config.zdrEnabled !== false);
				setLockedFields(config.lockedFields ?? []);
				setCanManageSettings(config.canManageSettings);
				setModelAllowlist(config.modelAllowlist ?? []);
				setProcessingDisclosure(config.processingDisclosure ?? '');
				if (config.canManageSettings) {
					void Promise.all([
						apiFetch('/api/ai/admin/metrics').then((response) =>
							parseJsonResponse<AdminMetrics>(response)
						),
						apiFetch('/api/ai/admin/audit?limit=10').then((response) =>
							parseJsonResponse<{ entries: AuditEntry[] }>(response)
						),
						apiFetch('/api/ai/admin/health').then((response) =>
							parseJsonResponse<OperationalHealth>(response)
						),
						apiFetch('/api/ai/admin/safety').then((response) =>
							parseJsonResponse<{ safety: SafetyState }>(response)
						)
					])
						.then(([metrics, audit, health, safety]) => {
							setAdminMetrics(metrics);
							setAuditEntries(audit.entries);
							setOperationalHealth(health);
							setSafetyState(safety.safety);
						})
						.catch((reason: Error) => {
							setError(true);
							setStatus(reason.message);
						});
				}
				setStatus(
					config.mode === 'remote-agent'
						? t('settings.remote_configured', 'Remote agent configured')
						: t('settings.local_mode', 'Local agent mode')
				);
				setConfigLoaded(true);
			})
			.catch((reason: Error) => {
				setError(true);
				setStatus(reason.message);
				setConfigLoaded(true);
			});
	}, [t]);

	useEffect(() => {
		if (!canManageSettings) return undefined;
		const refreshHealth = (): void => {
			void apiFetch('/api/ai/admin/health')
				.then((response) => parseJsonResponse<OperationalHealth>(response))
				.then(setOperationalHealth)
				.catch(() => {
					// Preserve the last known health snapshot during transient refresh failures.
				});
		};
		const timer = window.setInterval(refreshHealth, 15_000);
		return (): void => window.clearInterval(timer);
	}, [canManageSettings]);

	const save = async (event: FormEvent): Promise<void> => {
		event.preventDefault();
		let zdrRiskAccepted = false;
		if (provider === 'openrouter' && savedZdrEnabled && !zdrEnabled) {
			zdrRiskAccepted = window.confirm(
				t(
					'settings.zdr_warning',
					'Disabling ZDR can allow the AI provider to retain prompts, responses, and Carbonio data sent for your requests according to its own policy. Continue?'
				)
			);
			if (!zdrRiskAccepted) return;
		}
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
					zdrEnabled,
					zdrRiskAccepted,
					fallbackModels: fallbackModels.split(',').map((item) => item.trim()).filter(Boolean),
					...(apiKey.trim() ? { apiKey } : {})
				})
			});
			const data = await parseJsonResponse<PublicConfig>(response);
			setProvider((data.effectiveProvider as keyof typeof providers) || 'custom');
			setAgentUrl(data.agentUrl);
			setModel(data.effectiveModel);
			setFallbackModels((data.fallbackModels ?? []).join(', '));
			setZdrEnabled(data.zdrEnabled !== false);
			setSavedZdrEnabled(data.zdrEnabled !== false);
			setModelAllowlist(data.modelAllowlist ?? []);
			setLockedFields(data.lockedFields ?? []);
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

	if (administration && configLoaded && !canManageSettings) {
		return (
			<Page>
				<h1>{t('settings.admin_page_title', 'AI Administration')}</h1>
				<p role="alert">
					{t('settings.admin_access_denied', 'Administrator access is required for this page.')}
				</p>
			</Page>
		);
	}

	return (
		<Page>
			<h1>{administration ? t('settings.admin_page_title', 'AI Administration') : t('app.name', 'AI Assistant')}</h1>
			<p>{administration
				? t('settings.admin_page_description', 'Manage gateway privacy policy, health, safety, and operations.')
				: t('settings.description', 'Configure your AI provider, private AI sources, and review your activity.')}</p>
			{!administration ? (
			<Card onSubmit={(event): void => void save(event)}>
				{!canManageSettings ? (
					<p>
						{t(
							'settings.admin_only',
							'Only a Carbonio AI administrator can change provider settings.'
						)}
					</p>
				) : null}
				<Field>
					{t('settings.provider', 'AI provider')}
					<Select
						disabled={!canManageSettings || lockedFields.includes('provider')}
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
						{lockedFields.includes('provider')
							? t('settings.managed_by_environment', 'Managed by environment')
							: t(
							'settings.provider_hint',
							'The endpoint and protocol are configured automatically.'
							)}
					</Hint>
				</Field>
				{provider === 'custom' ? (
					<Field>
						{t('settings.custom_endpoint', 'Custom endpoint')}
						<Input
							disabled={!canManageSettings || lockedFields.includes('agentUrl')}
							type="url"
							placeholder="https://agent.example.com/chat"
							value={agentUrl}
							onChange={(event): void => setAgentUrl(event.target.value)}
						/>
					</Field>
				) : (
					<Field>
						{t('settings.endpoint', 'Endpoint')}
					<Input type="url" value={agentUrl} readOnly disabled={!canManageSettings} />
					</Field>
				)}
				<Field>
					{t('settings.model', 'Model')}
					{modelAllowlist.length > 0 && !modelAllowlist.includes('*') ? (
						<Select
							value={model}
							disabled={!canManageSettings || lockedFields.includes('model')}
							onChange={(event): void => setModel(event.target.value)}
						>
							{modelAllowlist.map((allowedModel) => (
								<option key={allowedModel} value={allowedModel}>
									{allowedModel}
								</option>
							))}
						</Select>
					) : (
						<Input
							type="text"
							placeholder="~openai/gpt-latest"
							value={model}
							disabled={!canManageSettings || lockedFields.includes('model')}
							onChange={(event): void => setModel(event.target.value)}
						/>
					)}
					<Hint>
						{lockedFields.includes('model')
							? t('settings.managed_by_environment', 'Managed by environment')
							: t(
							'settings.model_hint',
							'Provider model ID. A recommended default is filled automatically.'
							)}
					</Hint>
				</Field>
				<Field>
					{t('settings.api_key', 'API key')}
					<Input
						type="password"
						disabled={!canManageSettings}
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
				<Field>
					{t('settings.fallback_models', 'Fallback models')}
					<Input
						type="text"
						disabled={!canManageSettings || lockedFields.includes('fallbackModels')}
						placeholder="model-a, model-b"
						value={fallbackModels}
						onChange={(event): void => setFallbackModels(event.target.value)}
					/>
					<Hint>{t('settings.fallback_models_hint', 'Tried in order only for availability, timeout, rate-limit, and server failures. Authentication and invalid requests never fall back.')}</Hint>
				</Field>
				<CheckRow>
					<input
						type="checkbox"
						checked={zdrEnabled}
						disabled={
							!canManageSettings ||
							provider !== 'openrouter' ||
							lockedFields.includes('zdrEnabled')
						}
						onChange={(event): void => setZdrEnabled(event.target.checked)}
					/>
					<span>
						{t('settings.zdr_label', 'Enforce Zero Data Retention (ZDR)')}
						<Hint>
							{lockedFields.includes('zdrEnabled')
								? t('settings.managed_by_environment', 'Managed by environment')
								: t(
										'settings.zdr_hint',
										'OpenRouter only. Keep enabled for stronger privacy. Disable only when the selected model has no ZDR-compatible endpoint.'
									)}
						</Hint>
					</span>
				</CheckRow>
				<Actions>
					<Save type="submit" disabled={saving || !canManageSettings}>
						{saving
							? t('settings.saving', 'Saving...')
							: t('settings.save', 'Save configuration')}
					</Save>
					<SecondaryButton type="button" disabled={!canManageSettings || saving || testingProvider} onClick={(): void => void testProvider()}>
						{testingProvider ? t('settings.provider_testing_short', 'Testing...') : t('settings.provider_test', 'Test saved connection')}
					</SecondaryButton>
					<Status error={error}>{status}</Status>
				</Actions>
				{processingDisclosure ? <Hint>{processingDisclosure}</Hint> : null}
			</Card>
			) : null}
			{!administration && canManageSettings ? (
				<AdminPanel>
					<h2>{t('settings.admin_page_title', 'AI Administration')}</h2>
					<p>{t('settings.admin_console_hint', 'Gateway privacy policy, health, and global safety controls are managed in the Carbonio Admin Console. Provider credentials remain in Webmail settings.')}</p>
					<AdminConsoleLink href={`${window.location.protocol}//${window.location.hostname}:6071/carbonioAdmin/ai-assistant`}>
						{t('settings.admin_open_console', 'Open AI Administration')}
					</AdminConsoleLink>
				</AdminPanel>
			) : null}
			{!administration ? (
			<AdminPanel>
				<h2>{t('settings.rag_title', 'Manage AI Sources')}</h2>
				<p>
					{t(
						'settings.rag_privacy',
						'Private indexing is off by default. Data is isolated to your account, encrypted at rest, and Carbonio session cookies are never stored.'
					)}
				</p>
				<Actions>
					<SecondaryButton
						type="button"
						onClick={(): void => {
							for (const source of ragSources.filter(({ available, enabled }) => available && !enabled)) {
								void updateRagSource(source.module, true);
							}
						}}
					>
						{t('settings.rag_enable_all', 'Enable all supported sources')}
					</SecondaryButton>
					{ragStatus ? <Status>{ragStatus}</Status> : null}
				</Actions>
				<SourceList>
					{ragSources.map((source) => (
						<SourceRow key={source.module}>
							<div>
								<strong>
									{t(`settings.rag_module_${source.module}`, source.label)}
								</strong>
								<Hint>
									{source.available
										? t('settings.rag_source_status', '{{status}} · {{documents}} documents · {{chunks}} chunks', {
												status: t(`settings.rag_status_${source.status}`, source.status),
												documents: source.indexedDocuments,
												chunks: source.indexedChunks
											})
										: t(`settings.rag_unavailable_${source.module}`, source.unavailableReason)}
								</Hint>
								{source.lastSyncStats && Object.keys(source.lastSyncStats).length ? (
									<Hint>{t('settings.rag_incremental_stats', 'Last sync: {{scanned}} scanned · {{changed}} changed · {{unchanged}} unchanged · {{deleted}} deleted', {
										scanned: source.lastSyncStats.scanned ?? 0,
										changed: source.lastSyncStats.changed ?? 0,
										unchanged: source.lastSyncStats.unchanged ?? 0,
										deleted: source.lastSyncStats.deleted ?? 0
									})}</Hint>
								) : null}
								{source.lastError ? <Status error>{source.lastError}</Status> : null}
							</div>
							<SourceActions>
								<SecondaryButton
									type="button"
									disabled={!source.available || ragBusy.includes(source.module)}
									onClick={(): void => void updateRagSource(source.module, !source.enabled)}
								>
									{source.enabled ? t('settings.rag_remove', 'Remove') : t('settings.rag_enable', 'Enable')}
								</SecondaryButton>
								<SecondaryButton
									type="button"
									disabled={!source.available || !source.enabled || ragBusy.includes(source.module)}
									onClick={(): void => void syncRagSource(source.module)}
								>
									{t('settings.rag_sync', 'Sync now')}
								</SecondaryButton>
							</SourceActions>
						</SourceRow>
					))}
				</SourceList>
			</AdminPanel>
			) : null}
			{!administration && accountUsage ? (
				<AdminPanel>
					<h2>{t('settings.usage_title', 'Your AI usage')}</h2>
					<p>
						{t('settings.usage_requests', '{{used}} of {{limit}} requests today', {
							used: accountUsage.requestCount,
							limit: accountUsage.requestLimit
						})}
					</p>
					<p>
						{t('settings.usage_tokens', '{{used}} of {{limit}} tokens today', {
							used: accountUsage.totalTokens.toLocaleString(),
							limit: accountUsage.tokenLimit.toLocaleString()
						})}
					</p>
					<Hint>{accountUsage.date}</Hint>
				</AdminPanel>
			) : null}
			{!administration ? (
			<AdminPanel>
				<h2>{t('settings.safety_center', 'AI Safety Center')}</h2>
				<p>{t('settings.safety_center_hint', 'Review your recent AI tool activity. Recoverable operations can be undone for a limited time and always require confirmation.')}</p>
				<AuditList>
					{userAuditEntries.length ? userAuditEntries.map((entry) => (
						<AuditRow key={entry.id}>
							<strong>{entry.tool}</strong> · {entry.risk} · {entry.status} · {new Date(entry.createdAt).toLocaleString()}
							{entry.resultReference ? <Hint>{t('settings.target_reference', 'Target')}: {entry.resultReference}</Hint> : null}
							{entry.requestId ? <Hint>{t('settings.request_id', 'Request ID')}: {entry.requestId}</Hint> : null}
							{entry.undoAvailable ? (
								<SecondaryButton type="button" disabled={undoBusy.includes(entry.id)} onClick={(): void => void undoAuditEntry(entry)}>
									{undoBusy.includes(entry.id) ? t('settings.undoing', 'Undoing...') : t('settings.undo', 'Undo')}
								</SecondaryButton>
							) : null}
						</AuditRow>
					)) : <li>{t('settings.no_tool_activity', 'No AI tool activity recorded yet.')}</li>}
				</AuditList>
			</AdminPanel>
			) : null}
			{administration && canManageSettings ? (
				<AdminPanel>
					<h2>{t('settings.admin_status', 'Administration status')}</h2>
					{operationalHealth ? (
						<>
							<p><strong>{t('settings.overall_health', 'Overall health')}:</strong> {operationalHealth.status}</p>
							<HealthGrid>
								{Object.entries(operationalHealth.components).map(([name, health]) => (
									<HealthCard key={name}>
										<strong>{name}</strong>
										<HealthStatus error={health.status === 'error'}>{health.status}</HealthStatus>
										<Hint>{health.detail}</Hint>
									</HealthCard>
								))}
							</HealthGrid>
						</>
					) : null}
					<h3>{t('settings.emergency_controls', 'Emergency controls')}</h3>
					<p>{safetyState?.writeToolsEnabled
						? t('settings.write_tools_active', 'AI write tools are currently enabled.')
						: t('settings.write_tools_stopped', 'AI write tools are currently stopped. Read-only tools remain available.')}</p>
					<SecondaryButton
						type="button"
						disabled={!safetyState || (!safetyState.environmentAllowsWrites && !safetyState.writeToolsEnabled)}
						onClick={(): void => void updateSafety(!safetyState?.writeToolsEnabled)}
					>
						{safetyState?.writeToolsEnabled ? t('settings.stop_writes', 'Stop all AI writes') : t('settings.enable_writes', 'Enable AI writes')}
					</SecondaryButton>
					<AdminSummary>
						{adminMetrics
							? JSON.stringify(
									{
										uptimeSeconds: adminMetrics.metrics.uptimeSeconds,
										...adminMetrics.policy,
										...adminMetrics.metrics.counters
									},
									null,
									2
								)
							: t('settings.loading', 'Loading configuration...')}
					</AdminSummary>
					<h3>{t('settings.recent_tool_activity', 'Recent tool activity')}</h3>
					<AuditList>
						{auditEntries.map((entry) => (
							<li key={entry.id}>
								{entry.tool} · {entry.status} · {entry.ownerId} ·{' '}
								{new Date(entry.createdAt).toLocaleString()}
							</li>
						))}
					</AuditList>
				</AdminPanel>
			) : null}
		</Page>
	);
};

export const AiAdministrationView = (): React.JSX.Element => (
	<AiSettingsView administration />
);
