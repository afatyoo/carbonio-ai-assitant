import { logEvent } from './logger.js';

export const attachPostgresPoolErrorHandler = (pool, { log = logEvent } = {}) => {
	pool.on('error', (error) => {
		log('error', 'postgres_pool_error', {
			error_name: error?.name ?? 'Error',
			code: error?.code
		});
	});
};
