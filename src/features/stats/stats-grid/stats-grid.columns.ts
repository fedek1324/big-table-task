import { ColDef, ColDefField, ValueFormatterParams, ValueGetterParams } from 'ag-grid-enterprise';
import { ORDERED_LEVELS, METADATA_LABELS } from '../../../types/levels.types';
import { MetricNodeData } from '../../../types/metric.types';
import { Metrics } from '../../../types/metrics.types';

// TODO maybe inherit statItem
export function statsGridColumnsFactory<T extends MetricNodeData>(dates: string[], metric: Metrics) {
    const metadataColumns: ColDef<T>[] = ORDERED_LEVELS.map((level, index) => ({
        colId: level,
        headerName: METADATA_LABELS[level],
        field: level as ColDefField<T>,
        rowGroup: true,
        rowGroupIndex: index,
        initialHide: true,
    }));

    const sumColumn: ColDef<T> = {
        colId: 'sums',
        headerName: 'Sum',
        valueGetter: (params: ValueGetterParams<T>) => {
            let sum = params.data?.sum;
            return sum !== undefined ? Math.round(sum) : sum;
        },
        valueFormatter: (params: ValueFormatterParams<T>) => {
            return params.value?.toLocaleString() ?? 'нет данных';
        },
    };
    const averageColumn: ColDef<T> = {
        colId: 'average',
        headerName: 'Average',
        valueGetter: (params: ValueGetterParams<T>) => {
            let average = params.data?.average;
            return average !== undefined ? Math.round(average) : average;
        },
        valueFormatter: (params: ValueFormatterParams<T>) => {
            return params.value?.toLocaleString() ?? 'нет данных';
        },
    };

    const datesColumns: ColDef<T>[] = dates.map((date, index) => ({
        headerName: date,
        colId: `${index}`,
        valueGetter: (params: ValueGetterParams<T>) => {
            const value = params.data?.metricData[index];
            return value !== undefined ? value : null;
        },
        valueFormatter: (params: ValueFormatterParams<T>) => {
            if (params.value === null || params.value === undefined) {
                return 'нет данных';
            }
            return params.value.toLocaleString();
        },
    }));

    if (metric === Metrics.cost) {
        return [...metadataColumns, averageColumn, ...datesColumns];
    } else {
        return [...metadataColumns, sumColumn, averageColumn, ...datesColumns];
    }
}
