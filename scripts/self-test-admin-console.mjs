import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => readFile(path.join(projectRoot, relativePath), 'utf8');

const [html, app, styles, nginx, installer, uninstaller, packager, server, mailbox, config, agent, settings] =
	await Promise.all([
		read('admin-ui/index.html'),
		read('admin-ui/app.js'),
		read('admin-ui/styles.css'),
		read('gateway/deploy/nginx/admin-backend-carbonio-ai.conf'),
		read('deploy/install.sh'),
		read('deploy/uninstall.sh'),
		read('deploy/package-release.sh'),
		read('gateway/src/server.js'),
		read('gateway/src/mailbox.js'),
		read('gateway/src/config.js'),
		read('gateway/src/agent.js'),
		read('src/views/ai-settings-view.tsx')
	]);

assert.match(html, /\/carbonioAdmin\/ai-assistant\/assets\/app\.js/);
assert.match(html, /id="zdr-accept"/);
assert.doesNotMatch(app, /innerHTML|localStorage|sessionStorage|document\.cookie/);
assert.match(app, /credentials:\s*'same-origin'/);
assert.match(app, /response\.status === 401/);
assert.match(app, /window\.location\.replace\('\/static\/login\/'\)/);
for (const endpoint of [
	'/api/ai/config',
	'/api/ai/admin/health',
	'/api/ai/admin/metrics',
	'/api/ai/admin/safety',
	'/api/ai/admin/audit',
	'/api/ai/admin/knowledge',
	'/api/ai/admin/accounts',
	'/api/ai/admin/accounts/access'
]) assert.ok(app.includes(endpoint), `Missing admin console endpoint: ${endpoint}`);
assert.doesNotMatch(html, /id="provider"|id="model"|id="api-key"|id="agent-url"/);
assert.match(html, /Provider privacy policy/);
assert.match(html, /Organization knowledge/);
assert.match(html, /User access/);
assert.match(html, /id="account-body"/);
assert.match(html, /Upload and index/i);
assert.match(html, /id="knowledge-notice"/);
assert.match(app, /organization document queued/i);
assert.match(app, /PDF and Office indexing is not enabled on this server/);
assert.match(app, /zdrRiskAccepted:\s*disablingZdr && zdrAccept\.checked/);
assert.match(app, /entry\.ownerName \|\| entry\.ownerId/);
assert.match(app, /Enable AI access for/);
assert.match(app, /User access changes saved and are active now/);
assert.match(styles, /\.health-item header/);

assert.match(nginx, /ZM_ADMIN_AUTH_TOKEN/);
assert.match(nginx, /X-Carbonio-AI-Admin-Console 1/);
assert.match(nginx, /X-Forwarded-Host \$http_host/);
assert.match(nginx, /alias \/opt\/carbonio-ai-assistant\/admin-ui\/current\/index\.html/);
assert.match(nginx, /default_type text\/html/);
assert.match(nginx, /return 308 \/carbonioAdmin\/ai-assistant;/);
assert.match(nginx, /client_max_body_size 15m/);
assert.match(installer, /nginx\.conf\.web\.carbonio\.admin\.default/);
assert.match(installer, /nginx\.conf\.web\.carbonio\.admin\.default\.template/);
assert.match(installer, /admin-backend-carbonio-ai\.conf/);
assert.match(uninstaller, /grep -Fvx "\$nginx_admin_include"/);
assert.match(packager, /cp -a admin-ui\/\./);

assert.match(server, /getCurrentAdminSession/);
assert.match(server, /x-carbonio-ai-admin-console/);
assert.match(mailbox, /GetAllServers/);
assert.match(mailbox, /GetAccount/);
assert.match(mailbox, /urn:zimbraAdmin/);
assert.match(server, /unresolvedOwnerIds/);
assert.match(server, /listAdminAccounts/);
assert.match(server, /updateAccountAccess/);
assert.match(mailbox, /auth credentials have expired/);
assert.match(mailbox, /error\.statusCode = 401/);
assert.match(config, /Disabling ZDR requires explicit provider data-retention risk acceptance/);
assert.match(config, /zdrRiskAcceptedAt/);
assert.match(agent, /zdr:\s*config\.zdrEnabled/);
assert.match(agent, /organization:global/);
assert.match(settings, /carbonioAdmin\/ai-assistant/);
assert.match(settings, /HealthStatus/);

console.log('admin_console=ok carbonio_admin_auth=soap zdr=explicit_risk_acceptance status_spacing=ok');
