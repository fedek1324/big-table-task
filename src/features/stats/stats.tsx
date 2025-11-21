import { PageWrapper } from '../../components/page-wrapper/page-wrapper';
import { StatsMetricSelector } from './metric-selector/stats-metric-selector';
import { StatsGrid } from './stats-grid/stats-grid';

export function Stats() {
    return (
        <PageWrapper title='Stats' description='Stats'>
            <StatsMetricSelector />
            <StatsGrid />
        </PageWrapper>
    );
}
