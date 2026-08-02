const startedAt = Date.now();
const counters = new Map();

export const incrementMetric = (name, amount = 1) => {
	counters.set(name, (counters.get(name) ?? 0) + amount);
};

export const getMetricsSnapshot = () => ({
	startedAt,
	uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
	counters: Object.fromEntries([...counters.entries()].sort(([left], [right]) => left.localeCompare(right)))
});
