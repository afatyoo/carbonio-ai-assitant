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
