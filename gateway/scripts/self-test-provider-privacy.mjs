import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const originalCwd = process.cwd();
const workspace = await mkdtemp(path.join(tmpdir(), 'carbonio-ai-zdr-test-'));
process.chdir(workspace);

try {

let providerRequest = null;
globalThis.fetch = async (_url, options) => {
	providerRequest = JSON.parse(options.body);
	return new Response(
		JSON.stringify({
			choices: [{ message: { content: 'Privacy routing active.' } }],
			usage: { prompt_tokens: 4, completion_tokens: 3 }
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } }
	);
};

process.env.NODE_ENV = 'production';
process.env.AI_AGENT_PROVIDER = 'openrouter';
process.env.AI_AGENT_MODEL = 'test/privacy-model';
process.env.AI_MODEL_ALLOWLIST = 'test/privacy-model';
process.env.AI_OPENROUTER_DENY_DATA_COLLECTION = 'false';
process.env.AI_OPENROUTER_ZDR = 'true';

const { getPublicAgentConfig, updateAgentConfig } = await import('../src/config.js');
assert.equal(getPublicAgentConfig().zdrEnabled, true);
assert.throws(
	() => updateAgentConfig({
		provider: 'openrouter',
		model: 'test/privacy-model',
		fallbackModels: [],
		zdrEnabled: false
	}),
	/explicit provider data-retention risk acceptance/
);
updateAgentConfig({
	provider: 'openrouter',
	model: 'test/privacy-model',
	fallbackModels: [],
	zdrEnabled: false,
	zdrRiskAccepted: true
});

const { runAgent } = await import('../src/agent.js');
await runAgent({
	message: 'Hello',
	model: 'test/privacy-model',
	cookie: '',
	account: { id: '', name: 'privacy-test@carbonio.test' },
	permissions: [],
	emit: () => {}
});

assert.deepEqual(providerRequest?.provider, {
	data_collection: 'deny',
	zdr: false
});
console.log('openrouter_zdr_default=on explicit_risk_acceptance=required override=ok');
} finally {
	process.chdir(originalCwd);
	await rm(workspace, { recursive: true, force: true });
}
