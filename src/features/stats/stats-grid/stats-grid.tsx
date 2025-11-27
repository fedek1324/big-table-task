import { AgGridReact } from 'ag-grid-react';
import { useEffect, useState } from 'react';
import { ColDef, GridReadyEvent, IServerSideDatasource, themeBalham } from 'ag-grid-enterprise';
// TODO: Выбрать только необходимые модули
// Все Enterprise модули
import { AllEnterpriseModule, ModuleRegistry } from 'ag-grid-enterprise';
import { useSearchParams } from 'react-router-dom';
import { useUnit } from 'effector-react';
import { Metrics } from '../stats.const';
import { TreeNode } from '../../../types/tree.types';
import './stats-grid.scss';
import { statsGridColumnsFactory } from './stats-grid.columns';
import { $rowData, setMetric } from '../../../store/stats.store';

ModuleRegistry.registerModules([AllEnterpriseModule]);

export function StatsGrid() {
    const [columnDefs, setColumnDefs] = useState<ColDef<TreeNode>[]>([]);
    const [searchParams] = useSearchParams();
    const metric = searchParams.get('metric') ?? Metrics.cost;
    const rowData = useUnit($rowData);

    // Устанавливаем метрику из URL параметров в store
    useEffect(() => {
        setMetric(metric);
    }, [metric]);

    // Генерируем колонки для TreeNode
    useEffect(() => {
        const dates = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
        setColumnDefs(statsGridColumnsFactory(dates));
    }, [metric]);

    const onGridReady = (event: GridReadyEvent) => {
        const datasource: IServerSideDatasource<any> = {
            getRows(params) {
                console.log('Запрос getRows:', JSON.stringify(params.request, null, 1));

                if (!rowData || rowData.length === 0) {
                    console.log('Данные еще не загружены');
                    params.success({ rowData: [] });
                    return;
                }

                const { groupKeys, startRow, endRow } = params.request;
                const level = groupKeys.length;

                console.log('Запрошен уровень:', level, 'groupKeys:', groupKeys, 'startRow:', startRow, 'endRow:', endRow);

                let allFilteredRows: TreeNode[];

                if (level === 0) {
                    // Корневой уровень - возвращаем все узлы верхнего уровня (поставщики)
                    allFilteredRows = rowData.filter((node: TreeNode) => node.level === 0);
                } else {
                    // Находим родительский узел по groupKeys
                    const parentId = groupKeys[groupKeys.length - 1];
                    const parentNode = rowData.find((node: TreeNode) => node.id === parentId);

                    if (parentNode && parentNode.children.length > 0) {
                        // Возвращаем дочерние узлы этого родителя
                        const childIds = parentNode.children as string[];
                        allFilteredRows = rowData.filter((node: TreeNode) => childIds.includes(node.id));
                    } else {
                        allFilteredRows = [];
                    }
                }

                // Нарезаем данные согласно startRow и endRow для пагинации
                const rowsToReturn = allFilteredRows.slice(startRow, endRow);
                const totalRowCount = allFilteredRows.length;

                console.log('Всего строк доступно:', totalRowCount, 'Возвращается строк:', rowsToReturn.length, `(${startRow}-${endRow})`);

                params.success({
                    rowData: rowsToReturn,
                    rowCount: totalRowCount,
                });
            },
        };

        event.api.setGridOption('serverSideDatasource', datasource);
    };

    return (
        <div className='stats-grid ag-theme-balham'>
            <h2>Данные за последние 30 дней</h2>
            {rowData && (
                <AgGridReact
                    rowModelType='serverSide'
                    onGridReady={onGridReady}
                    treeData={true}
                    isServerSideGroup={(dataItem: TreeNode) => dataItem.children && dataItem.children.length > 0}
                    getServerSideGroupKey={(dataItem: TreeNode) => dataItem.id}
                    autoGroupColumnDef={{
                        headerName: 'Hierarchy',
                        menuTabs: ['columnsMenuTab'],
                        pinned: 'left',
                        valueGetter: (params) => {
                            const data = params.data as TreeNode;
                            if (!data) return '';

                            // Отображаем соответствующее поле в зависимости от уровня узла
                            switch (data.level) {
                                case 0:
                                    return data.supplier;
                                case 1:
                                    return data.brand;
                                case 2:
                                    return data.type;
                                case 3:
                                    return data.article;
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
                    columnDefs={columnDefs}
                ></AgGridReact>
            )}
        </div>
    );
}
