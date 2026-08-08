if (!process.env.AI_DATABASE_URL) {
	throw new Error('AI_DATABASE_URL is required by the private RAG worker');
}

const { claimRagJob, closeRagDatabase, completeRagJob, failRagJob, finalizeRagSync } =
	await import('./rag-postgres.js');
import { embedPrivateText } from './rag-embeddings.js';
import { chunkRagText } from './rag-text.js';
import { logEvent } from './logger.js';

const pollMs = Math.min(Math.max(Number(process.env.AI_RAG_WORKER_POLL_MS ?? 1_000), 250), 10_000);
let stopping = false;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const processJob = async (job) => {
	if (job.operation === 'finalize') {
		await finalizeRagSync(job);
		return;
	}
	const chunks = [];
	for (const chunk of chunkRagText(job.payload.content)) {
		chunks.push({ ...chunk, embedding: await embedPrivateText(chunk.content) });
	}
	await completeRagJob(job, job.payload, chunks);
	logEvent('info', 'rag_job_completed', {
		job_id: job.id,
		module: job.module,
		chunk_count: chunks.length
	});
};

process.once('SIGTERM', () => {
	stopping = true;
});
process.once('SIGINT', () => {
	stopping = true;
});

logEvent('info', 'rag_worker_started', {});
while (!stopping) {
	const job = await claimRagJob();
	if (!job) {
		await wait(pollMs);
		continue;
	}
	try {
		await processJob(job);
	} catch (error) {
		await failRagJob(job, error);
		logEvent('error', 'rag_job_failed', { job_id: job.id, module: job.module, error });
	}
}
logEvent('info', 'rag_worker_stopped', {});
await closeRagDatabase();
