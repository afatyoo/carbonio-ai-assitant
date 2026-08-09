const startedAt = Date.now();
const counters = new Map();

export const incrementMetric = (name, amount = 1) => {
	counters.set(name, (counters.get(name) ?? 0) + amount);
};

export const setMetric = (name, value) => {
	const numeric = Number(value);
	if (Number.isFinite(numeric)) counters.set(name, numeric);
};

export const observeMetric = (name, value) => {
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || numeric < 0) return;
	incrementMetric(`${name}_count`);
	incrementMetric(`${name}_total`, numeric);
	counters.set(`${name}_max`, Math.max(counters.get(`${name}_max`) ?? 0, numeric));
};

export const getMetricsSnapshot = () => ({
	startedAt,
	uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
	counters: Object.fromEntries([...counters.entries()].sort(([left], [right]) => left.localeCompare(right)))
});

const prometheusName = (name) =>
	`carbonio_ai_${String(name).replace(/[^a-zA-Z0-9_:]/g, '_').replace(/^([^a-zA-Z_:])/, '_$1')}`;

export const formatPrometheusMetrics = ({ extraGauges = {} } = {}) => {
	const snapshot = getMetricsSnapshot();
	const values = {
		process_uptime_seconds: snapshot.uptimeSeconds,
		...snapshot.counters,
		...extraGauges
	};
	return `${Object.entries(values)
		.filter(([, value]) => Number.isFinite(Number(value)))
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([name, value]) => {
			const metric = prometheusName(name);
			return `# TYPE ${metric} gauge\n${metric} ${Number(value)}`;
		})
		.join('\n')}\n`;
};
