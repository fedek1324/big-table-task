import { AgGridReact } from 'ag-grid-react';
import { useEffect, useState, useRef } from 'react';
import { IStatItem } from '../../../types/stats.types';
import { STATS_API } from '../../../api/stats.api';
import { ColDef, themeBalham } from 'ag-grid-enterprise';
import { useSearchParams } from 'react-router-dom';
import { Metrics } from '../stats.const';
import { statsGridColumnsFactory } from './stats-grid.columns';
import AggregateWorker from '../helpers/aggregateDataWorker?worker';
import './stats-grid.scss';

export function StatsGrid() {
    const [rowData, setRowData] = useState<IStatItem[] | null>(null);
    const [columnDefs, setColumnDefs] = useState<ColDef<IStatItem>[]>([]);
    const [searchParams] = useSearchParams();
    const metric = searchParams.get('metric') ?? Metrics.cost;
    const workerRef = useRef<Worker | null>(null);

    // Алгоритм
    // 1. Загружаем данные через getFull и сразу отображаем
    // 2. Отправляем данные в воркер для вычисления агрегированных значений для выбранной метрики
    // 3. Получаем обработанные данные из воркера и обновляем rowData
    // TODO: Потом в фоне подгружаем данные для других метрик
    // TODO: Всегда кэшируем через indexDb

    // Загружаем данные с бэкенда
    useEffect(() => {
        STATS_API.getFull().then((data) => {
            console.log('getFull data[0] ', data[0]);
            // Сразу отображаем данные без агрегации
            setRowData(data);
        });
    }, []);

    useEffect(() => {
        const dates = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
        setColumnDefs(statsGridColumnsFactory(metric, dates));
    }, [metric]);

    useEffect(() => {
        workerRef.current = new AggregateWorker();

        workerRef.current.onmessage = (e: MessageEvent) => {
            const { data } = e;
            console.log('worker.onmessage received:', data);
            console.log('Aggregation finished, updating rowData');
            setRowData(data);
        };

        workerRef.current.onerror = (error: ErrorEvent) => {
            console.error('Worker error:', error);
        };

        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    // Отправляем данные в воркер для агрегации при изменении данных или метрики
    // useEffect(() => {
    //     if (rowData && rowData.length > 0 && workerRef.current) {
    //         try {
    //             workerRef.current.postMessage({ data: rowData, aggregateType: metric });
    //         } catch (error) {
    //             console.error('Error sending message to worker:', error);
    //         }
    //     }
    // }, [rowData, metric]);

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
