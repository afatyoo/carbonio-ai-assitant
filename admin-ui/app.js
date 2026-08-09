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
		throw new Error(`Gateway returned invalid JSON (${response.status})`);
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

let config = null;
let safety = null;

const setNotice = (message, kind = '') => {
	notice.textContent = message;
	notice.className = `notice${kind ? ` ${kind}` : ''}`;
};

const setBusy = (busy) => {
	savePrivacyButton.disabled = busy;
	uploadKnowledgeButton.disabled = busy;
	byId('refresh').disabled = busy;
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
				setNotice('Organization document removed.', 'success');
				await load();
			} catch (error) {
				setNotice(error.message || 'Unable to remove organization document.', 'error');
			}
		});
		row.prepend(details);
		list.append(row);
	}
	if (!documents.length) addText(list, 'p', 'No organization documents uploaded yet.', 'muted');
};

const load = async () => {
	setBusy(true);
	setNotice('Loading administrator configuration...');
	try {
		const [nextConfig, health, metrics, safetyResult, audit, knowledge] = await Promise.all([
			api('/api/ai/config'),
			api('/api/ai/admin/health'),
			api('/api/ai/admin/metrics'),
			api('/api/ai/admin/safety'),
			api('/api/ai/admin/audit?limit=25'),
			api('/api/ai/admin/knowledge')
		]);
		if (!nextConfig.canManageSettings) throw new Error('Administrator access is required');
		renderConfig(nextConfig);
		renderHealth(health);
		renderPolicy(metrics);
		renderSafety(safetyResult.safety);
		renderAudit(audit.entries || []);
		renderKnowledge(knowledge);
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
	if (file.size > 10_000_000) {
		setNotice('Document exceeds the 10 MB upload limit.', 'error');
		return;
	}
	setBusy(true);
	setNotice('Uploading and queueing organization knowledge...');
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
		setNotice('Organization document queued for indexing.', 'success');
		await load();
	} catch (error) {
		setNotice(error.message || 'Unable to upload organization document.', 'error');
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
