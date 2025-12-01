import { AgGridReact } from 'ag-grid-react';
import { useEffect, useState, useRef, useMemo } from 'react';
import { ColDef, GridReadyEvent, IServerSideDatasource, GridApi, themeBalham } from 'ag-grid-enterprise';
import { AG_GRID_LOCALE_RU } from '../../../i18n/AgGridRu';
import { useSearchParams } from 'react-router-dom';
import { useUnit } from 'effector-react';
import { Metrics, isMetric } from '../../../types/metrics.types';
import { Levels } from '../../../types/levels.types';
import { MetricNodeData, MetricDataMap, getLevel } from '../../../types/metric.types';
import './stats-grid.scss';
import { statsGridColumnsFactory } from './stats-grid.columns';
import { $rowData, setMetric } from '../../../store/stats.store';
import { useTranslation } from 'react-i18next';

// Тип для узла с id и level для использования в grid
interface GridNode extends MetricNodeData {
    id: string;
    level: Levels;
}

export function StatsGrid() {
    const [columnDefs, setColumnDefs] = useState<ColDef<GridNode>[]>([]);
    const gridApiRef = useRef<GridApi | null>(null);
    const [searchParams] = useSearchParams();
    const metricParam = searchParams.get('metric');
    const metric = metricParam && isMetric(metricParam) ? metricParam : Metrics.cost;
    const rowData = useUnit($rowData);
    const { t, i18n } = useTranslation();

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
    const createDatasource = (data: MetricDataMap | null): IServerSideDatasource<any> => ({
        getRows(params) {
            // console.log('Запрос getRows:', JSON.stringify(params.request, null, 1));

            if (!data || Object.keys(data).length === 0) {
                params.success({ rowData: [] });
                return;
            }

            const { groupKeys, startRow, endRow } = params.request;
            const level = groupKeys.length;

            // console.log('Запрошен уровень:', level, 'groupKeys:', groupKeys, 'startRow:', startRow, 'endRow:', endRow);

            let allFilteredRows: GridNode[];
            if (level === 0) {
                // Корневой уровень - возвращаем все узлы верхнего уровня (поставщики)
                allFilteredRows = Object.entries(data)
                    .filter(([id]) => getLevel(id) === Levels.supplier)
                    .map(([id, nodeData]) => ({
                        ...nodeData,
                        id,
                        level: getLevel(id),
                    }));
            } else {
                const parentId = groupKeys[groupKeys.length - 1];
                const parentNode = data[parentId];
                const childIds = parentNode?.childIds || [];
                allFilteredRows = childIds
                    .map((id) => {
                        const nodeData = data[id];
                        if (!nodeData) return null;
                        return {
                            ...nodeData,
                            id,
                            level: getLevel(id),
                        };
                    })
                    .filter(Boolean) as GridNode[];
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
                isServerSideGroup={(dataItem: GridNode) => {
                    const hasChildren = dataItem.childIds && dataItem.childIds.length > 0;
                    return hasChildren;
                }}
                getServerSideGroupKey={(dataItem: GridNode) => dataItem.id}
                autoGroupColumnDef={{
                    headerName: t('table.hierarchy'),
                    menuTabs: ['columnsMenuTab'],
                    pinned: 'left',
                    valueGetter: (params) => {
                        const data = params.data as GridNode;
                        if (!data) return '';

                        // Извлекаем имя из id в зависимости от уровня
                        const parts = data.id.split(':');
                        switch (data.level) {
                            case Levels.supplier:
                                return parts[0]; // supplier
                            case Levels.brand:
                                return parts[1]; // brand
                            case Levels.type:
                                return parts[2]; // type
                            case Levels.article:
                                return parts[3]; // article
                            default:
                                return '';
                        }
                    },
                    cellRendererParams: {
                        suppressCount: true,
                    },
                }}
                theme={themeBalham.withParams({
                    backgroundColor: 'var(--bs-body-bg)',
                    foregroundColor: 'var(--bs-body-color)',
                    browserColorScheme: 'light',
                })}
                localeText={gridLocale}
                columnDefs={columnDefs}
            ></AgGridReact>
        </div>
    );
}
