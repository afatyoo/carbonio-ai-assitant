import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const destination = path.resolve(process.argv[2] ?? '');
const backupRoot = '/var/backups/carbonio-ai-assistant';
if (!destination.startsWith(`${backupRoot}/runtime-state-`)) {
	throw new Error('Runtime state destination must be an explicit timestamped directory under the addon backup root');
}
fs.mkdirSync(destination, { recursive: false, mode: 0o700 });

const runtimeRoot = '/var/lib/carbonio-ai-assistant/.runtime';
const auditSource = path.resolve(process.env.AI_AUDIT_DB_PATH || path.join(runtimeRoot, 'audit.sqlite'));
const files = [];

const record = (filePath) => {
	const data = fs.readFileSync(filePath);
	files.push({
		name: path.basename(filePath),
		bytes: data.length,
		sha256: createHash('sha256').update(data).digest('hex')
	});
};

if (fs.existsSync(auditSource)) {
	const auditDestination = path.join(destination, 'audit.sqlite');
	const database = new DatabaseSync(auditSource, { readOnly: true });
	try {
		database.exec(`VACUUM INTO '${auditDestination.replaceAll("'", "''")}'`);
	} finally {
		database.close();
	}
	fs.chmodSync(auditDestination, 0o600);
	record(auditDestination);
}

for (const name of ['config.json', 'security-state.json']) {
	const source = path.join(runtimeRoot, name);
	if (!fs.existsSync(source)) continue;
	const target = path.join(destination, name);
	fs.copyFileSync(source, target);
	fs.chmodSync(target, 0o600);
	record(target);
}

const manifest = path.join(destination, 'manifest.json');
fs.writeFileSync(manifest, `${JSON.stringify({ createdAt: Date.now(), files }, null, 2)}\n`, { mode: 0o600 });
console.log(`Runtime state snapshot created: ${destination}`);
