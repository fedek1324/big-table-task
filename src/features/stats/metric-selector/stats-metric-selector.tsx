import { useMemo } from 'react';
import { Form } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { isMetric, Metrics, METRICS_LABELS } from '@/types/metrics.types';
import { useTranslation } from 'react-i18next';

import './stats-metric-selector.scss';

export function StatsMetricSelector() {
    const [searchParams, setSearchParams] = useSearchParams();
    const metricSearchParam = searchParams.get('metric');
    const value = useMemo(() => (metricSearchParam && isMetric(metricSearchParam) ? metricSearchParam : Metrics.cost), [metricSearchParam]);
    const { t } = useTranslation();
    const metricNamePath = 'metrics';

    return (
        <Form.Select
            name='metric'
            size='sm'
            value={value}
            onChange={(e) => {
                setSearchParams({ metric: e.target.value });
            }}
            className='selector'
        >
            <option value={Metrics.cost}>{t(`${metricNamePath}.${METRICS_LABELS[Metrics.cost]}`)}</option>
            <option value={Metrics.orders}>{t(`${metricNamePath}.${METRICS_LABELS[Metrics.orders]}`)}</option>
            <option value={Metrics.returns}>{t(`${metricNamePath}.${METRICS_LABELS[Metrics.returns]}`)}</option>
            <option value={Metrics.revenue}>{t(`${metricNamePath}.${METRICS_LABELS[Metrics.revenue]}`)}</option>
            <option value={Metrics.buyouts}>{t(`${metricNamePath}.${METRICS_LABELS[Metrics.buyouts]}`)}</option>
        </Form.Select>
    );
}
