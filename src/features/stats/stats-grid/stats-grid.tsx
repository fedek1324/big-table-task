import { AgGridReact } from 'ag-grid-react';
import { useEffect, useState, useRef } from 'react';
import { IStatItem } from '../../../types/stats.types';
import { STATS_API } from '../../../api/stats.api';
import { ColDef, GridReadyEvent, IServerSideDatasource, themeBalham } from 'ag-grid-enterprise';
// TODO Select only needed
// All Enterprise Features
import { AllEnterpriseModule, ModuleRegistry } from 'ag-grid-enterprise';
import { useSearchParams } from 'react-router-dom';
import { Metrics } from '../stats.const';
import HandleDataWorker from '../helpers/handleDataWorker?worker';
import { TreeNode } from '../../../types/tree.types';
import './stats-grid.scss';
import { statsGridColumnsFactory } from './stats-grid.columns';

ModuleRegistry.registerModules([AllEnterpriseModule]);

export function StatsGrid() {
    const [serverData, setServerData] = useState<IStatItem[] | null>(null); // Данные с сервера
    const [rowData, setRowData] = useState<TreeNode[] | null>(null); // Данные для AG-Grid
    const [columnDefs, setColumnDefs] = useState<ColDef<TreeNode>[]>([]);
    const [searchParams] = useSearchParams();
    const metric = searchParams.get('metric') ?? Metrics.cost;
    const handleDataWorkerRef = useRef<Worker | null>(null);
    const handleDataRequestIdRef = useRef<number>(0);

    // Алгоритм
    // 1. Загружаем данные через getFull ОДИН РАЗ и сохраняем в serverData
    // 2. Эти данные отправляем в worker для агрегации по данной метрике
    //    В результате получаем массив данных TreeNode[].
    // 3. Отображаем TreeNode[] отображаем в AG-Grid с использованием SSRM для
    //    динамической отправки нужных данных в таблицу.
    // TODO: Кэшируем через indexDb

    // Загружаем данные с сервера ОДИН РАЗ
    useEffect(() => {
        STATS_API.getFull().then((data) => {
            console.log('getFull data:', data);
            setServerData(data);
        });
    }, []);

    // Инициализируем handleDataWorker
    useEffect(() => {
        handleDataWorkerRef.current = new HandleDataWorker();

        handleDataWorkerRef.current.onmessage = (e: MessageEvent) => {
            const { treeData, requestId } = e.data;
            console.log('HandleDataWorker: onmessage, requestId:', requestId);

            // Игнорируем устаревшие ответы
            if (requestId !== handleDataRequestIdRef.current) {
                console.log('HandleDataWorker: Ignoring outdated response, expected:', handleDataRequestIdRef.current);
                return;
            }

            console.log('HandleDataWorker: Tree received, nodes count:', Object.keys(treeData).length);

            // Преобразуем object в массив TreeNode
            const treeArray = Object.values(treeData) as TreeNode[];
            setRowData(treeArray);
        };

        handleDataWorkerRef.current.onerror = (error: ErrorEvent) => {
            console.error('HandleDataWorker error:', error);
        };

        return () => {
            handleDataWorkerRef.current?.terminate();
        };
    }, []);

    // Отправляем данные в воркер при изменении serverData или метрики
    useEffect(() => {
        if (serverData && serverData.length > 0 && handleDataWorkerRef.current) {
            handleDataRequestIdRef.current += 1;
            const currentRequestId = handleDataRequestIdRef.current;

            console.log('Sending data to HandleDataWorker, metric:', metric, 'requestId:', currentRequestId);
            try {
                handleDataWorkerRef.current.postMessage({
                    data: serverData,
                    metric,
                    requestId: currentRequestId,
                });
            } catch (error) {
                console.error('Error sending message to HandleDataWorker:', error);
            }
        }
    }, [serverData, metric]);

    // Генерируем колонки для TreeNode
    useEffect(() => {
        const dates = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
        setColumnDefs(statsGridColumnsFactory(dates));
    }, [metric]);

    const onGridReady = (event: GridReadyEvent) => {
        const datasource: IServerSideDatasource<any> = {
            getRows(params) {
                console.log('getRows request:', JSON.stringify(params.request, null, 1));

                if (!rowData || rowData.length === 0) {
                    console.log('No rowData available yet');
                    params.success({ rowData: [] });
                    return;
                }

                const { groupKeys, startRow, endRow } = params.request;
                const level = groupKeys.length;

                console.log('Requested level:', level, 'groupKeys:', groupKeys, 'startRow:', startRow, 'endRow:', endRow);

                let allFilteredRows: TreeNode[];

                if (level === 0) {
                    // Root level - return all top-level nodes (suppliers)
                    allFilteredRows = rowData.filter((node) => node.level === 0);
                } else {
                    // Find the parent node based on groupKeys
                    const parentId = groupKeys[groupKeys.length - 1];
                    const parentNode = rowData.find((node) => node.id === parentId);

                    if (parentNode && parentNode.children.length > 0) {
                        // Return children of this parent
                        const childIds = parentNode.children as string[];
                        allFilteredRows = rowData.filter((node) => childIds.includes(node.id));
                    } else {
                        allFilteredRows = [];
                    }
                }

                // Slice the data according to startRow and endRow for pagination
                const rowsToReturn = allFilteredRows.slice(startRow, endRow);
                const totalRowCount = allFilteredRows.length;

                console.log('Total rows available:', totalRowCount, 'Returning rows:', rowsToReturn.length, `(${startRow}-${endRow})`);

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

                            // Display the appropriate field based on node level
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
