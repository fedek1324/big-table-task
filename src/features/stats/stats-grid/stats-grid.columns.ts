import { ColDef, ColDefField, ValueFormatterParams, ValueGetterParams } from 'ag-grid-enterprise';
import { IStatItem, ORDERED_LEVELS } from '../../../types/stats.types';
import { METADATA_LABELS } from '../stats.const';
import { TreeNodeBase } from '../../../types/tree.types';

// TODO maybe inherit statItem
export function statsGridColumnsFactory<T extends TreeNodeBase>(dates: string[]) {
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
            return params.data?.sum ?? 0;
        },
        valueFormatter: (params: ValueFormatterParams<T>) => {
            return params.value?.toLocaleString() ?? '';
        },
    };
    const averageColumn: ColDef<T> = {
        colId: 'average',
        headerName: 'Average',
        valueGetter: (params: ValueGetterParams<T>) => {
            return params.data?.average ?? 0;
        },
        valueFormatter: (params: ValueFormatterParams<T>) => {
            return params.value?.toLocaleString() ?? '';
        },
    };

    const datesColumns: ColDef<T>[] = dates.map((date, index) => ({
        headerName: date,
        colId: `${index}`,
        valueGetter: (params: ValueGetterParams<T>) => {
            return params.data?.metricData[index] ?? 0;
        },
        valueFormatter: (params: ValueFormatterParams<T>) => {
            return params.value?.toLocaleString() ?? '';
        },
    }));

    return [...metadataColumns, sumColumn, averageColumn, ...datesColumns];
}
