import { AgGridReact } from 'ag-grid-react';
import { useEffect, useState, useRef, useMemo } from 'react';
import { ColDef, GridReadyEvent, IServerSideDatasource, GridApi, themeBalham } from 'ag-grid-enterprise';
import { AG_GRID_LOCALE_RU } from '@/i18n/AgGridRu';
import { useSearchParams } from 'react-router-dom';
import { useUnit } from 'effector-react';
import { Metrics, isMetric } from '@/types/metrics.types';
import { ORDERED_LEVELS } from '@/types/levels.types';
import { TableDataMap, getLevel, getNameFromNodeId } from '@/types/tableNode.types';
import './stats-grid.scss';
import { statsGridColumnsFactory } from './stats-grid.columns';
import { $rowData, $isLoading, setMetric } from '@/store/stats.store';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { AgGridNode, toGridNode } from '@/types/agGridNode.types';

export function StatsGrid() {
    const [columnDefs, setColumnDefs] = useState<ColDef<AgGridNode>[]>([]);
    const gridApiRef = useRef<GridApi | null>(null);
    const [searchParams] = useSearchParams();
    const metricParam = searchParams.get('metric');
    const metric = metricParam && isMetric(metricParam) ? metricParam : Metrics.cost;
    const rowData = useUnit($rowData);
    const isLoading = useUnit($isLoading);
    const { t, i18n } = useTranslation();
    const { theme } = useTheme();

    // Выбираем локаль для AgGrid в зависимости от текущего языка
    const gridLocale = useMemo(() => {
        return i18n.language === 'ru' ? AG_GRID_LOCALE_RU : undefined;
    }, [i18n.language]);

    // Устанавливаем метрику из URL параметров в store
    useEffect(() => {
        setMetric(metric);
    }, [metric]);

    // Генерируем колонки для TreeNode
    useEffect(() => {
        const dates = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
        setColumnDefs(statsGridColumnsFactory(dates, metric, t));
    }, [metric, t]);

    // Создаем datasource на основе текущих данных
    const createDatasource = (data: TableDataMap | null): IServerSideDatasource<any> => ({
        getRows(params) {
            // console.log('Запрос getRows:', JSON.stringify(params.request, null, 1));

            if (!data || Object.keys(data).length === 0) {
                params.success({ rowData: [] });
                return;
            }

            const { groupKeys, startRow, endRow } = params.request;
            const level = groupKeys.length;

            // console.log('Запрошен уровень:', level, 'groupKeys:', groupKeys, 'startRow:', startRow, 'endRow:', endRow);

            let allFilteredRows: AgGridNode[];
            if (level === 0) {
                // Корневой уровень - возвращаем все узлы верхнего уровня (поставщики)
                allFilteredRows = Object.entries(data)
                    .filter(([id]) => getLevel(id) === ORDERED_LEVELS[0])
                    .map(([id, nodeData]) => toGridNode(id, nodeData));
            } else {
                const parentId = groupKeys[groupKeys.length - 1];
                const parentNode = data[parentId];
                const childIds = parentNode?.childIds || [];
                allFilteredRows = childIds
                    .map((id) => {
                        const nodeData = data[id];
                        if (!nodeData) return null;
                        return toGridNode(id, nodeData);
                    })
                    .filter(Boolean) as AgGridNode[];
            }

            // Нарезаем данные согласно startRow и endRow для пагинации
            const rowsToReturn = allFilteredRows.slice(startRow, endRow);
            const totalRowCount = allFilteredRows.length;

            // console.log('Всего строк доступно:', totalRowCount, 'Возвращается строк:', rowsToReturn.length, `(${startRow}-${endRow})`);

            params.success({
                rowData: rowsToReturn,
                rowCount: totalRowCount,
            });
        },
    });

    // Обновляем datasource при изменении rowData
    useEffect(() => {
        if (gridApiRef.current) {
            const datasource = createDatasource(rowData);
            gridApiRef.current.setGridOption('serverSideDatasource', datasource);
        }
    }, [rowData]);

    const onGridReady = (event: GridReadyEvent) => {
        gridApiRef.current = event.api;
        const datasource = createDatasource(rowData);
        event.api.setGridOption('serverSideDatasource', datasource);
    };

    return (
        <div className='stats-grid ag-theme-balham'>
            <AgGridReact
                rowModelType='serverSide'
                onGridReady={onGridReady}
                treeData={true}
                loading={isLoading}
                isServerSideGroup={(dataItem: AgGridNode) => {
                    const hasChildren = dataItem.childIds && dataItem.childIds.length > 0;
                    return hasChildren;
                }}
                getServerSideGroupKey={(dataItem: AgGridNode) => dataItem.id}
                autoGroupColumnDef={{
                    headerName: t('table.hierarchy'),
                    menuTabs: ['columnsMenuTab'],
                    pinned: 'left',
                    valueGetter: (params) => {
                        const data = params.data as AgGridNode;
                        if (!data) return '';

                        return getNameFromNodeId(data.id);
                    },
                    cellRendererParams: {
                        suppressCount: true,
                    },
                }}
                theme={themeBalham.withParams({
                    backgroundColor: 'var(--bs-body-bg)',
                    foregroundColor: 'var(--bs-body-color)',
                    browserColorScheme: theme,
                })}
                localeText={gridLocale}
                columnDefs={columnDefs}
            ></AgGridReact>
        </div>
    );
}
