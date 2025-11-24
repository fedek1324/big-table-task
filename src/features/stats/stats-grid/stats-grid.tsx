import { AgGridReact } from 'ag-grid-react';
import { useEffect, useState, useRef } from 'react';
import { IStatItem } from '../../../types/stats.types';
import { STATS_API } from '../../../api/stats.api';
import { ColDef, themeBalham } from 'ag-grid-enterprise';
import { useSearchParams } from 'react-router-dom';
import { Metrics } from '../stats.const';
import BuildTreeWorker from '../helpers/buildTreeWorker?worker';
import { TreeNode } from '../../../types/tree.types';
import './stats-grid.scss';
import { statsGridColumnsFactory } from './stats-grid.columns';

export function StatsGrid() {
    const [serverData, setServerData] = useState<IStatItem[] | null>(null); // Данные с сервера
    const [rowData, setRowData] = useState<TreeNode[] | null>(null); // Данные для AG-Grid
    const [columnDefs, setColumnDefs] = useState<ColDef<TreeNode>[]>([]);
    const [searchParams] = useSearchParams();
    const metric = searchParams.get('metric') ?? Metrics.cost;
    const buildTreeWorkerRef = useRef<Worker | null>(null);
    const buildTreeRequestIdRef = useRef<number>(0);

    // Алгоритм
    // 1. Загружаем данные через getFull ОДИН РАЗ и сохраняем в serverData
    // 2. При смене метрики отправляем serverData в buildTreeWorker
    // 3. Получаем иерархическое дерево и отображаем в AG-Grid
    // TODO: Кэшируем через indexDb

    // Загружаем данные с сервера ОДИН РАЗ
    useEffect(() => {
        STATS_API.getFull().then((data) => {
            console.log('getFull data, count:', data.length);
            setServerData(data);
        });
    }, []);

    // Инициализируем buildTreeWorker
    useEffect(() => {
        buildTreeWorkerRef.current = new BuildTreeWorker();

        buildTreeWorkerRef.current.onmessage = (e: MessageEvent) => {
            const { treeData, rootNodeIds, requestId } = e.data;
            console.log('BuildTreeWorker: onmessage, requestId:', requestId);

            // Игнорируем устаревшие ответы
            if (requestId !== buildTreeRequestIdRef.current) {
                console.log('BuildTreeWorker: Ignoring outdated response, expected:', buildTreeRequestIdRef.current);
                return;
            }

            console.log('BuildTreeWorker: Tree received, nodes count:', Object.keys(treeData).length);

            // Преобразуем object в массив TreeNode
            const treeArray = Object.values(treeData) as TreeNode[];
            setRowData(treeArray);
        };

        buildTreeWorkerRef.current.onerror = (error: ErrorEvent) => {
            console.error('BuildTreeWorker error:', error);
        };

        return () => {
            buildTreeWorkerRef.current?.terminate();
        };
    }, []);

    // Отправляем данные в воркер при изменении serverData или метрики
    useEffect(() => {
        if (serverData && serverData.length > 0 && buildTreeWorkerRef.current) {
            buildTreeRequestIdRef.current += 1;
            const currentRequestId = buildTreeRequestIdRef.current;

            console.log('Sending data to BuildTreeWorker, metric:', metric, 'requestId:', currentRequestId);
            try {
                buildTreeWorkerRef.current.postMessage({
                    data: serverData,
                    metric,
                    requestId: currentRequestId,
                });
            } catch (error) {
                console.error('Error sending message to BuildTreeWorker:', error);
            }
        }
    }, [serverData, metric]);

    // Генерируем колонки для TreeNode
    useEffect(() => {
        const dates = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
        setColumnDefs(statsGridColumnsFactory(dates));
    }, [metric]);

    return (
        <div className='stats-grid ag-theme-balham'>
            <AgGridReact
                groupHideParentOfSingleChild='leafGroupsOnly'
                autoGroupColumnDef={{
                    menuTabs: ['columnsMenuTab'],
                    pinned: 'left',
                    field: 'article', // явно указываем что отображаем артикли
                }}
                theme={themeBalham.withParams({
                    backgroundColor: 'var(--bs-body-bg)',
                    foregroundColor: 'var(--bs-body-color)',
                    browserColorScheme: 'light',
                })}
                rowData={rowData}
                columnDefs={columnDefs}
            ></AgGridReact>
        </div>
    );
}
