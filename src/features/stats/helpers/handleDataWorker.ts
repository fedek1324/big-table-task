import { IStatItem } from '@/types/stats.types';
import { Metrics } from '@/types/metrics.types';
import { processData } from './dataHandleHelpers';

onmessage = function (e) {
    const { data, metric } = e.data;

    const result = processData(data as IStatItem[], metric as Metrics);
    const treeObject = result.treeData;

    postMessage({
        treeData: treeObject,
        metric: metric,
    });
};
