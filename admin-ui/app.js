let redirectingToLogin = false;

const api = async (path, options = {}) => {
	const response = await fetch(path, {
		credentials: 'same-origin',
		cache: 'no-store',
		...options,
		headers: {
			accept: 'application/json',
			...(options.body ? { 'content-type': 'application/json' } : {}),
			...(options.headers ?? {})
		}
	});
	const text = await response.text();
	let data;
	try {
		data = text ? JSON.parse(text) : {};
	} catch {
		const contentType = response.headers.get('content-type') || '';
		const responseKind = contentType.includes('text/html') ? 'an HTML proxy error page' : 'a non-JSON response';
		throw new Error(`Gateway HTTP ${response.status} returned ${responseKind}`);
	}
	if (response.status === 401) {
		if (!redirectingToLogin) {
			redirectingToLogin = true;
			window.location.replace('/static/login/');
		}
		throw new Error('Administrator session expired. Redirecting to Carbonio login...');
	}
	if (!response.ok) throw new Error(data.error || `Gateway HTTP ${response.status}`);
	return data;
};

const byId = (id) => document.getElementById(id);
const notice = byId('notice');
const zdrEnabled = byId('zdr-enabled');
const zdrRisk = byId('zdr-risk');
const zdrAccept = byId('zdr-accept');
const savePrivacyButton = byId('save-privacy');
const toggleWrites = byId('toggle-writes');
const knowledgeFile = byId('knowledge-file');
const uploadKnowledgeButton = byId('upload-knowledge');
const accountSearch = byId('account-search');
const accountPrevious = byId('accounts-previous');
const accountNext = byId('accounts-next');
const saveAccountAccess = byId('save-account-access');

let config = null;
let safety = null;
let documentExtraction = {};
let accountPage = { accounts: [], offset: 0, limit: 50, more: false };
const accountChanges = new Map();

const setNotice = (message, kind = '') => {
	notice.textContent = message;
	notice.className = `notice${kind ? ` ${kind}` : ''}`;
};

const setKnowledgeNotice = (message = '', kind = '') => {
	const element = byId('knowledge-notice');
	element.textContent = message;
	element.className = `notice compact${kind ? ` ${kind}` : ''}${message ? '' : ' hidden'}`;
};

const setAccountNotice = (message = '', kind = '') => {
	const element = byId('account-notice');
	element.textContent = message;
	element.className = `notice compact${kind ? ` ${kind}` : ''}${message ? '' : ' hidden'}`;
};

const setBusy = (busy) => {
	savePrivacyButton.disabled = busy;
	uploadKnowledgeButton.disabled = busy;
	byId('refresh').disabled = busy;
	saveAccountAccess.disabled = busy || accountChanges.size === 0;
};

const applyLocks = () => {
	const locked = new Set(config?.lockedFields ?? []);
	zdrEnabled.disabled = locked.has('zdrEnabled');
};

const showZdrRisk = () => {
	const risky = !zdrEnabled.checked;
	zdrRisk.classList.toggle('hidden', !risky);
	if (!risky) zdrAccept.checked = false;
};

const renderConfig = (next) => {
	config = next;
	zdrEnabled.checked = next.zdrEnabled !== false;
	applyLocks();
	showZdrRisk();
};

const addText = (parent, tag, value, className = '') => {
	const element = document.createElement(tag);
	element.textContent = String(value ?? '');
	if (className) element.className = className;
	parent.append(element);
	return element;
};

const renderHealth = (health) => {
	const overall = byId('overall-health');
	overall.textContent = health.status;
	overall.className = `badge ${health.status}`;
	const grid = byId('health-grid');
	grid.replaceChildren();
	for (const [name, item] of Object.entries(health.components || {})) {
		const card = document.createElement('article');
		card.className = 'health-item';
		const header = document.createElement('header');
		addText(header, 'strong', name);
		addText(header, 'span', item.status, `badge ${item.status}`);
		card.append(header);
		addText(card, 'p', item.detail);
		grid.append(card);
	}
};

const renderPolicy = (metrics) => {
	const list = byId('policy-list');
	list.replaceChildren();
	const entries = {
		'Gateway uptime': `${metrics.metrics?.uptimeSeconds ?? 0} seconds`,
		...(metrics.policy ?? {}),
		'Provider circuit': JSON.stringify(metrics.providerCircuits ?? {})
	};
	for (const [name, value] of Object.entries(entries)) {
		addText(list, 'dt', name);
		addText(list, 'dd', typeof value === 'object' ? JSON.stringify(value) : value);
	}
};

const renderSafety = (next) => {
	safety = next;
	byId('write-state').textContent = next.writeToolsEnabled
		? 'AI write tools are enabled. Every mutation still requires confirmation.'
		: 'Emergency write stop is active. Read-only tools remain available.';
	toggleWrites.textContent = next.writeToolsEnabled ? 'Stop all AI writes' : 'Enable AI writes';
	toggleWrites.className = `button ${next.writeToolsEnabled ? 'danger' : 'primary'}`;
	toggleWrites.disabled = !next.environmentAllowsWrites && !next.writeToolsEnabled;
};

const renderAudit = (entries) => {
	const body = byId('audit-body');
	body.replaceChildren();
	for (const entry of entries) {
		const row = document.createElement('tr');
		addText(row, 'td', new Date(entry.createdAt).toLocaleString());
		const ownerCell = addText(row, 'td', entry.ownerName || entry.ownerId || 'Unknown user');
		if (entry.ownerName && entry.ownerId) ownerCell.title = `Carbonio account ID: ${entry.ownerId}`;
		for (const value of [
			entry.tool,
			entry.risk,
			entry.status,
			entry.requestId || ''
		]) addText(row, 'td', value);
		body.append(row);
	}
	if (!entries.length) {
		const row = document.createElement('tr');
		const cell = addText(row, 'td', 'No tool activity recorded.');
		cell.colSpan = 6;
		body.append(row);
	}
};

const renderKnowledge = ({ documents = [], extraction = {}, source = null }) => {
	documentExtraction = extraction;
	const list = byId('knowledge-list');
	list.replaceChildren();
	const capability = extraction.enabled
		? 'Safe text and sandboxed PDF/Office extraction are available.'
		: 'Safe text files are available. PDF/Office uploads fail closed until scanner, sandbox, and extractor commands are configured.';
	byId('knowledge-capability').textContent = `${source?.status ? `Index status: ${source.status}. ${source.indexedDocuments} documents and ${source.indexedChunks} chunks. ` : ''}${capability}`;
	for (const entry of documents) {
		const row = document.createElement('article');
		row.className = 'document-row';
		const details = document.createElement('div');
		addText(details, 'strong', entry.title);
		addText(details, 'p', `${entry.metadata?.contentType || 'document'} · ${new Date(entry.updatedAt).toLocaleString()}`);
		const remove = addText(row, 'button', 'Remove', 'button danger');
		remove.type = 'button';
		remove.addEventListener('click', async () => {
			if (!window.confirm(`Remove ${entry.title} from organization knowledge?`)) return;
			try {
				await api(`/api/ai/admin/knowledge/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
				setKnowledgeNotice('Organization document removed.', 'success');
				await load();
			} catch (error) {
				setKnowledgeNotice(error.message || 'Unable to remove organization document.', 'error');
			}
		});
		row.prepend(details);
		list.append(row);
	}
	if (!documents.length) addText(list, 'p', 'No organization documents uploaded yet.', 'muted');
};

const renderAccounts = (result) => {
	accountPage = result;
	const body = byId('account-body');
	body.replaceChildren();
	for (const account of result.accounts || []) {
		const row = document.createElement('tr');
		const userCell = document.createElement('td');
		userCell.className = 'account-user';
		addText(userCell, 'strong', account.name);
		if (account.displayName) addText(userCell, 'span', account.displayName);
		row.append(userCell);
		addText(row, 'td', account.status || 'unknown');
		const current = accountChanges.get(account.id) || {
			id: account.id,
			name: account.name,
			aiEnabled: account.access?.aiEnabled === true,
			writeToolsEnabled: account.access?.writeToolsEnabled === true
		};
		const active = account.status === 'active';
		const aiCell = document.createElement('td');
		const aiToggle = document.createElement('input');
		aiToggle.type = 'checkbox';
		aiToggle.className = 'account-toggle';
		aiToggle.checked = current.aiEnabled;
		aiToggle.disabled = !active;
		aiToggle.setAttribute('aria-label', `Enable AI access for ${account.name}`);
		aiCell.append(aiToggle);
		row.append(aiCell);
		const writeCell = document.createElement('td');
		const writeToggle = document.createElement('input');
		writeToggle.type = 'checkbox';
		writeToggle.className = 'account-toggle';
		writeToggle.checked = current.writeToolsEnabled;
		writeToggle.disabled = !active || !current.aiEnabled;
		writeToggle.setAttribute('aria-label', `Enable write tools for ${account.name}`);
		writeCell.append(writeToggle);
		row.append(writeCell);
		const rememberChange = () => {
			accountChanges.set(account.id, {
				id: account.id,
				name: account.name,
				aiEnabled: aiToggle.checked,
				writeToolsEnabled: aiToggle.checked && writeToggle.checked
			});
			saveAccountAccess.disabled = accountChanges.size === 0;
		};
		aiToggle.addEventListener('change', () => {
			if (!aiToggle.checked) writeToggle.checked = false;
			writeToggle.disabled = !aiToggle.checked;
			rememberChange();
		});
		writeToggle.addEventListener('change', rememberChange);
		body.append(row);
	}
	if (!result.accounts?.length) {
		const row = document.createElement('tr');
		const cell = addText(row, 'td', 'No eligible Carbonio users found.');
		cell.colSpan = 4;
		body.append(row);
	}
	accountPrevious.disabled = result.offset <= 0;
	accountNext.disabled = !result.more;
	byId('accounts-page').textContent = result.accounts?.length
		? `Showing ${result.offset + 1} to ${result.offset + result.accounts.length}`
		: 'No accounts to show';
};

const loadAccounts = async (offset = 0) => {
	setAccountNotice('Loading Carbonio users...');
	const params = new URLSearchParams({ offset: String(offset), limit: '50' });
	if (accountSearch.value.trim()) params.set('query', accountSearch.value.trim());
	try {
		const result = await api(`/api/ai/admin/accounts?${params}`);
		renderAccounts(result);
		setAccountNotice('Carbonio user list loaded.', 'success');
	} catch (error) {
		setAccountNotice(error.message || 'Unable to load Carbonio users.', 'error');
	}
};

const load = async () => {
	setBusy(true);
	setNotice('Loading administrator configuration...');
	try {
		const [nextConfig, health, metrics, safetyResult, audit, knowledge, accounts] = await Promise.all([
			api('/api/ai/config'),
			api('/api/ai/admin/health'),
			api('/api/ai/admin/metrics'),
			api('/api/ai/admin/safety'),
			api('/api/ai/admin/audit?limit=25'),
			api('/api/ai/admin/knowledge'),
			api('/api/ai/admin/accounts?offset=0&limit=50')
		]);
		if (!nextConfig.canManageSettings) throw new Error('Administrator access is required');
		renderConfig(nextConfig);
		renderHealth(health);
		renderPolicy(metrics);
		renderSafety(safetyResult.safety);
		renderAudit(audit.entries || []);
		renderKnowledge(knowledge);
		renderAccounts(accounts);
		setNotice('Administrator configuration loaded.', 'success');
	} catch (error) {
		setNotice(error.message || 'Unable to load AI administration.', 'error');
	} finally {
		setBusy(false);
	}
};

zdrEnabled.addEventListener('change', showZdrRisk);

byId('privacy-form').addEventListener('submit', async (event) => {
	event.preventDefault();
	const disablingZdr = config?.zdrEnabled !== false && !zdrEnabled.checked;
	if (disablingZdr && !zdrAccept.checked) {
		setNotice('Accept the provider data-retention risk before disabling ZDR.', 'error');
		return;
	}
	setBusy(true);
	setNotice('Saving privacy policy...');
	try {
		const payload = {
			zdrEnabled: zdrEnabled.checked,
			zdrRiskAccepted: disablingZdr && zdrAccept.checked
		};
		const saved = await api('/api/ai/config', { method: 'PUT', body: JSON.stringify(payload) });
		renderConfig(saved);
		setNotice('Provider privacy policy saved.', 'success');
	} catch (error) {
		setNotice(error.message || 'Unable to save privacy policy.', 'error');
	} finally {
		setBusy(false);
	}
});

byId('knowledge-form').addEventListener('submit', async (event) => {
	event.preventDefault();
	const file = knowledgeFile.files?.[0];
	if (!file) return;
	const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
	const requiresExtractor = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(extension);
	if (requiresExtractor && !documentExtraction.enabled) {
		setKnowledgeNotice(
			'PDF and Office indexing is not enabled on this server. Configure the malware scanner, no-network sandbox, and document extractor first. TXT, Markdown, CSV, JSON, and XML can be indexed now.',
			'error'
		);
		return;
	}
	if (file.size > 10_000_000) {
		setKnowledgeNotice('Document exceeds the 10 MB upload limit.', 'error');
		return;
	}
	setBusy(true);
	setKnowledgeNotice('Uploading and queueing organization knowledge...');
	try {
		const dataUrl = await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.addEventListener('load', () => resolve(String(reader.result || '')));
			reader.addEventListener('error', () => reject(new Error('Unable to read the selected file')));
			reader.readAsDataURL(file);
		});
		const dataBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
		await api('/api/ai/admin/knowledge', {
			method: 'POST',
			body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream', dataBase64 })
		});
		knowledgeFile.value = '';
		setKnowledgeNotice('Organization document queued for indexing.', 'success');
		await load();
	} catch (error) {
		setKnowledgeNotice(error.message || 'Unable to upload organization document.', 'error');
	} finally {
		setBusy(false);
	}
});

byId('account-search-form').addEventListener('submit', async (event) => {
	event.preventDefault();
	accountChanges.clear();
	saveAccountAccess.disabled = true;
	await loadAccounts(0);
});

accountPrevious.addEventListener('click', () => {
	void loadAccounts(Math.max(accountPage.offset - accountPage.limit, 0));
});

accountNext.addEventListener('click', () => {
	if (accountPage.more) void loadAccounts(accountPage.offset + accountPage.limit);
});

saveAccountAccess.addEventListener('click', async () => {
	const accounts = [...accountChanges.values()];
	if (!accounts.length) return;
	setBusy(true);
	setAccountNotice(`Saving access for ${accounts.length} user${accounts.length === 1 ? '' : 's'}...`);
	try {
		await api('/api/ai/admin/accounts/access', {
			method: 'PUT',
			body: JSON.stringify({ accounts })
		});
		accountChanges.clear();
		saveAccountAccess.disabled = true;
		setAccountNotice('User access changes saved and are active now.', 'success');
		await loadAccounts(accountPage.offset);
	} catch (error) {
		setAccountNotice(error.message || 'Unable to save user access.', 'error');
	} finally {
		setBusy(false);
	}
});

toggleWrites.addEventListener('click', async () => {
	if (!safety) return;
	const next = !safety.writeToolsEnabled;
	if (!next && !window.confirm('Stop all AI write and destructive tools for every user?')) return;
	try {
		const result = await api('/api/ai/admin/safety', {
			method: 'PUT',
			body: JSON.stringify({ writeToolsEnabled: next })
		});
		renderSafety(result.safety);
		setNotice(next ? 'AI write tools enabled.' : 'Emergency write stop enabled.', 'success');
	} catch (error) {
		setNotice(error.message || 'Unable to update safety controls.', 'error');
	}
});

byId('refresh').addEventListener('click', load);
void load();
