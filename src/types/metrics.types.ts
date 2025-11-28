export enum Metrics {
    cost = 'cost',
    orders = 'orders',
    returns = 'returns',

    revenue = 'revenue',
    buyouts = 'buyouts',
}

export const METRICS_LABELS = {
    [Metrics.cost]: 'Cost',
    [Metrics.orders]: 'Orders',
    [Metrics.returns]: 'Returns',
    [Metrics.revenue]: 'Revenue',
    [Metrics.buyouts]: 'Buyouts',
} as const satisfies Record<Metrics, string>;

export function isMetric(value: string): value is Metrics {
    return Object.values(Metrics).includes(value as Metrics);
}
