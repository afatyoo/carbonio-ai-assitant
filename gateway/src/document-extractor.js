import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { incrementMetric, observeMetric } from './metrics.js';

const runFile = promisify(execFile);
const supportedTypes = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.ms-powerpoint',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/vnd.oasis.opendocument.text',
	'application/vnd.oasis.opendocument.spreadsheet',
	'application/vnd.oasis.opendocument.presentation'
]);

const configuredExecutable = (name) => {
	const value = String(process.env[name] ?? '').trim();
	if (!value || !path.isAbsolute(value)) return '';
	return value;
};

export const getDocumentExtractionCapability = () => {
	const scanner = configuredExecutable('AI_MALWARE_SCANNER_COMMAND');
	const sandbox = configuredExecutable('AI_DOCUMENT_SANDBOX_COMMAND');
	const extractor = configuredExecutable('AI_DOCUMENT_EXTRACTOR_COMMAND');
	const enabled = process.env.AI_DOCUMENT_EXTRACTION_ENABLED === 'true';
	return {
		enabled: enabled && Boolean(scanner && sandbox && extractor),
		configured: enabled,
		scannerConfigured: Boolean(scanner),
		sandboxConfigured: Boolean(sandbox),
		extractorConfigured: Boolean(extractor),
		supportedTypes: [...supportedTypes]
	};
};

export const extractSandboxedDocument = async ({ buffer, filename, contentType }) => {
	const normalizedType = String(contentType ?? '').split(';')[0].toLowerCase();
	if (!supportedTypes.has(normalizedType)) return { text: '', extraction: 'unsupported_type' };
	const capability = getDocumentExtractionCapability();
	if (!capability.enabled) return { text: '', extraction: 'sandbox_unavailable' };
	if (!Buffer.isBuffer(buffer) || buffer.length > 10_000_000) return { text: '', extraction: 'size_limit' };
	if (buffer.includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'))) {
		incrementMetric('document_malware_quarantined_total');
		return { text: '', extraction: 'malware_quarantined' };
	}
	const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'carbonio-ai-document-'));
	const safeName = path.basename(String(filename || 'document')).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
	const inputPath = path.join(workspace, safeName || 'document');
	const outputPath = path.join(workspace, 'extracted.txt');
	const startedAt = Date.now();
	try {
		await fs.writeFile(inputPath, buffer, { mode: 0o600 });
		try {
			await runFile(configuredExecutable('AI_MALWARE_SCANNER_COMMAND'), ['--no-summary', inputPath], {
				timeout: 30_000,
				maxBuffer: 64_000
			});
		} catch (error) {
			if (Number(error.code) === 1) {
				incrementMetric('document_malware_quarantined_total');
				return { text: '', extraction: 'malware_quarantined' };
			}
			throw new Error('Malware scanner failed closed');
		}
		await runFile(
			configuredExecutable('AI_DOCUMENT_SANDBOX_COMMAND'),
			[configuredExecutable('AI_DOCUMENT_EXTRACTOR_COMMAND'), inputPath, outputPath, normalizedType],
			{ timeout: 45_000, maxBuffer: 128_000 }
		);
		const output = await fs.readFile(outputPath);
		if (output.length > 500_000 || output.includes(0)) return { text: '', extraction: 'invalid_output' };
		incrementMetric('document_extraction_success_total');
		observeMetric('document_extraction_duration_ms', Date.now() - startedAt);
		return { text: output.toString('utf8').slice(0, 200_000), extraction: 'sandboxed_document' };
	} catch (error) {
		incrementMetric('document_extraction_failed_total');
		return { text: '', extraction: 'failed_closed', errorCode: String(error.message).slice(0, 120) };
	} finally {
		await fs.rm(workspace, { recursive: true, force: true });
	}
};
