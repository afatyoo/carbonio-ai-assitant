import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildReleaseNotes } from './build-release-notes.mjs';

const workspace = await mkdtemp(path.join(tmpdir(), 'carbonio-ai-release-report-'));

try {
	const reportPath = path.join(workspace, 'report.md');
	const checksumPath = path.join(workspace, 'archive.tar.gz.sha256');
	const outputPath = path.join(workspace, 'github-release-notes.md');
	const commit = '0123456789abcdef0123456789abcdef01234567';
	const runUrl = 'https://github.com/afatyoo/carbonio-ai-assitant/actions/runs/123456789';
	const checksum = 'a'.repeat(64);

	await writeFile(reportPath, '# Carbonio AI Assistant v1 Beta\n\nVerified report body.\n', 'utf8');
	await writeFile(
		checksumPath,
		`${checksum}  carbonio-ai-assistant-v1.0.0-beta.1.tar.gz\n`,
		'utf8'
	);

	await buildReleaseNotes({
		reportPath,
		version: '1.0.0-beta.1',
		tag: 'v1.0.0-beta.1',
		commit,
		runUrl,
		checksumPath,
		outputPath
	});

	const output = await readFile(outputPath, 'utf8');
	assert.match(output, /Verified report body\./);
	assert.match(output, /## Exact-build verification/);
	assert.match(output, /Tag: `v1\.0\.0-beta\.1`/);
	assert.match(output, new RegExp(`Commit: \`${commit}\``));
	assert.match(output, new RegExp(`Release workflow: ${runUrl}`));
	assert.match(output, new RegExp(`Artifact checksum: \`${checksum}  carbonio-ai-assistant-v1\\.0\\.0-beta\\.1\\.tar\\.gz\``));

	await assert.rejects(
		buildReleaseNotes({
			reportPath,
			version: '1.0.0-beta.1',
			tag: 'v1.0.0-beta.2',
			commit,
			runUrl,
			checksumPath,
			outputPath
		}),
		/Tag v1\.0\.0-beta\.2 does not match version 1\.0\.0-beta\.1/
	);

	console.log('release_report_contract=ok');
} finally {
	await rm(workspace, { recursive: true, force: true });
}
