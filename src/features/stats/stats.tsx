import { PageWrapper } from '../../components/page-wrapper/page-wrapper';
import { StatsMetricSelector } from './metric-selector/stats-metric-selector';
import { StatsGrid } from './stats-grid/stats-grid';
import { useTranslation } from 'react-i18next';

export function Stats() {
    const { t } = useTranslation();
    return (
        <PageWrapper title={t('page.stats')} description={t('page.stats')}>
            <StatsMetricSelector />
            <StatsGrid />
        </PageWrapper>
    );
}
