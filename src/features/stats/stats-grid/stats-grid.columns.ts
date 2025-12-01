import { ColDef, ColDefField, ValueFormatterParams, ValueGetterParams } from 'ag-grid-enterprise';
import { ORDERED_LEVELS, Levels } from '../../../types/levels.types';
import { MetricNodeData } from '../../../types/metric.types';
import { Metrics } from '../../../types/metrics.types';
import { TFunction } from 'i18next';

// TODO maybe inherit statItem
export function statsGridColumnsFactory<T extends MetricNodeData>(dates: string[], metric: Metrics, noDataMessage: string, t: TFunction) {
    const metadataColumns: ColDef<T>[] = ORDERED_LEVELS.map((level, index) => {
        const translationKey =
            level === Levels.supplier
                ? 'table.supplier'
                : level === Levels.brand
                  ? 'table.brand'
                  : level === Levels.type
                    ? 'table.type'
                    : 'table.article';
        return {
            colId: level,
            headerName: t(translationKey),
            field: level as ColDefField<T>,
            rowGroup: true,
            rowGroupIndex: index,
            initialHide: true,
        };
    });

    const sumColumn: ColDef<T> = {
        colId: 'sums',
        headerName: t('table.sum'),
        valueGetter: (params: ValueGetterParams<T>) => {
            let sum = params.data?.sum;
            return sum !== undefined ? Math.round(sum) : sum;
        },
        valueFormatter: (params: ValueFormatterParams<T>) => {
            return params.value?.toLocaleString() ?? noDataMessage;
        },
    };
    const averageColumn: ColDef<T> = {
        colId: 'average',
        headerName: t('table.average'),
        valueGetter: (params: ValueGetterParams<T>) => {
            let average = params.data?.average;
            return average !== undefined ? Math.round(average) : average;
        },
        valueFormatter: (params: ValueFormatterParams<T>) => {
            return params.value?.toLocaleString() ?? noDataMessage;
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
                return noDataMessage;
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
