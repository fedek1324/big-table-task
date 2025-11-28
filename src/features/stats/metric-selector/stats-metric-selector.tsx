import { useMemo } from 'react';
import { Form } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { isMetric, Metrics, METRICS_LABELS } from '../../../types/metrics.types';

export function StatsMetricSelector() {
    const [searchParams, setSearchParams] = useSearchParams();
    const metricSearchParam = searchParams.get('metric');
    const value = useMemo(() => (metricSearchParam && isMetric(metricSearchParam) ? metricSearchParam : Metrics.cost), [metricSearchParam]);

    return (
        <Form.Select
            name='metric'
            size='sm'
            value={value}
            onChange={(e) => {
                setSearchParams({ metric: e.target.value });
            }}
        >
            <option value={Metrics.cost}>{METRICS_LABELS[Metrics.cost]}</option>
            <option value={Metrics.orders}>{METRICS_LABELS[Metrics.orders]}</option>
            <option value={Metrics.returns}>{METRICS_LABELS[Metrics.returns]}</option>
            <option value={Metrics.revenue}>{METRICS_LABELS[Metrics.revenue]}</option>
            <option value={Metrics.buyouts}>{METRICS_LABELS[Metrics.buyouts]}</option>
        </Form.Select>
    );
}
