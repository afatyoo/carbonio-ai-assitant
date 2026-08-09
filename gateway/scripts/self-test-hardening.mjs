import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.AI_AGENT_PROVIDER = 'openrouter';
process.env.AI_AGENT_URL = 'https://provider.invalid/v1';
process.env.AI_AGENT_MODEL = 'test/primary';
process.env.AI_MODEL_FALLBACKS = 'test/fallback';
process.env.AI_MODEL_ALLOWLIST = 'test/primary,test/fallback';

const { formatPrometheusMetrics, incrementMetric } = await import('../src/metrics.js');
incrementMetric('hardening_test_total');
const prometheus = formatPrometheusMetrics({ extraGauges: { health_ok: 1 } });
assert.match(prometheus, /carbonio_ai_hardening_test_total 1/);
assert.match(prometheus, /carbonio_ai_health_ok 1/);

const { recordProviderStatus } = await import('../src/provider-status.js');
recordProviderStatus({ provider: 'openrouter', model: 'test/fallback', configuredModel: 'test/primary', usedFallback: true, latencyMs: 12 });
const { buildOperationalHealth } = await import('../src/operational-health.js');
const health = buildOperationalHealth({
	historyBackend: 'postgresql',
	rag: { backend: 'postgresql', queuedJobs: 0, failedJobs: 0, workerHealthy: true },
	aiEnabled: true,
	writeToolsEnabled: false
});
assert.equal(health.status, 'degraded');
assert.equal(health.provider.usedFallback, true);
assert.equal(health.components.writes.status, 'disabled');

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'carbonio-ai-hardening-'));
process.env.AI_AUDIT_DB_PATH = path.join(workspace, 'audit.sqlite');
const {
	claimUndoAction,
	completeClaimedUndoAction,
	createUndoAction,
	getUndoAction,
	releaseUndoAction
} = await import('../src/tool-audit.js');
createUndoAction({
	auditId: 'audit-1',
	ownerId: 'owner-a',
	toolName: 'move_email',
	input: { id: '440', folderId: '3' },
	result: { id: '440', previousFolderId: '2' }
});
assert.equal(getUndoAction('owner-b', 'audit-1'), null);
assert.equal(getUndoAction('owner-a', 'audit-1').tool, 'move_email');
assert.deepEqual(getUndoAction('owner-a', 'audit-1').input, { id: '440', folderId: '2' });
assert.equal(claimUndoAction('owner-a', 'audit-1'), true);
assert.equal(claimUndoAction('owner-a', 'audit-1'), false);
assert.equal(getUndoAction('owner-a', 'audit-1'), null);
assert.equal(releaseUndoAction('owner-a', 'audit-1'), true);
assert.equal(claimUndoAction('owner-a', 'audit-1'), true);
assert.equal(completeClaimedUndoAction('owner-a', 'audit-1'), true);
assert.equal(getUndoAction('owner-a', 'audit-1'), null);

const backupPolicy = await fs.readFile(new URL('../../deploy/backup-policy.sh', import.meta.url), 'utf8');
const restoreDrill = await fs.readFile(new URL('../../deploy/restore-drill.sh', import.meta.url), 'utf8');
const metricsToken = await fs.readFile(new URL('../../deploy/set-metrics-token.sh', import.meta.url), 'utf8');
const gatewayService = await fs.readFile(new URL('../deploy/carbonio-ai-gateway.service', import.meta.url), 'utf8');
const ragSetup = await fs.readFile(new URL('../../deploy/setup-rag-postgres.sh', import.meta.url), 'utf8');
const ragPostgres = await fs.readFile(new URL('../src/rag-postgres.js', import.meta.url), 'utf8');
assert.match(backupPolicy, /pg_restore --list/);
assert.match(backupPolicy, /AI_BACKUP_OFFSITE_PATH/);
assert.match(backupPolicy, /backup-runtime-state\.mjs/);
assert.match(restoreDrill, /AI_RESTORE_DRILL_DATABASE_URL/);
assert.match(restoreDrill, /must be isolated from production/);
assert.match(restoreDrill, /pg_extension WHERE extname = 'vector'/);
assert.match(restoreDrill, /--use-list/);
assert.doesNotMatch(restoreDrill, /ALTER ROLE[\s\S]*SUPERUSER/);
assert.match(metricsToken, /openssl rand -hex 32/);
assert.doesNotMatch(metricsToken, /echo \"\$token\"/);
assert.match(gatewayService, /LimitNOFILE=8192/);
assert.match(gatewayService, /MemoryMax=1G/);
assert.match(ragSetup, /rag_jobs, rag_runtime_status TO \$\{worker_user\}/);
assert.match(ragPostgres, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rag_runtime_status TO carbonio_ai_worker/);

const { extractSandboxedDocument, getDocumentExtractionCapability } = await import('../src/document-extractor.js');
assert.equal(getDocumentExtractionCapability().enabled, false);
assert.equal((await extractSandboxedDocument({ buffer: Buffer.from('%PDF-test'), filename: 'test.pdf', contentType: 'application/pdf' })).extraction, 'sandbox_unavailable');
assert.equal((await extractSandboxedDocument({ buffer: Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'), filename: 'test.pdf', contentType: 'application/pdf' })).extraction, 'sandbox_unavailable');

console.log('prometheus=ok health_matrix=ok undo=owner_scoped backup_policy=ok restore_drill=isolated systemd_limits=ok document_extraction=fail_closed');
