import { createStore, createEvent, createEffect, sample } from 'effector';
import { IStatItem } from '../types/stats.types';
import { Metrics } from '../types/metrics.types';
import { MetricDataMap } from '../types/metric.types';
import { STATS_API } from '../api/stats.api';
import HandleDataWorker from '../features/stats/helpers/handleDataWorker?worker';
import { initDB, saveMetricData, getMetricData, getMetricTimestamp } from './indexedDB';
import { isSameDay } from '../helpers/date.helpers';

const indexedDB = await initDB();

// Алгоритм
// Первая отрисовка с данными метрики
// При загрузке компонента с таблицей в стор устанавливается метрика
// При установке метрики проверяем кэш с данными по метрике, если кэш есть
// Кладём данные в стор $rowData и отрисовываем таблицу
// Если кэша нет, то проверяем, если ли данные сервера в сторе $serverData,
// если нет, подгружаем данные с сервера и сохраняем в стор
// После того как данные $serverData будут загружены агрегируем с помощью воркера и кладём в $rowData
// (затирая данные стора по прежней метрике)

// Подгрузка в лейзи
// Когда выполняется либо loadFromCacheFx.doneData либо saveToIndexedDBFx.doneData
// проверяем объект metricsTimestamps из IndexedDB и определяем данные каких метрик нужно обновить
// отправляем сообщения в воркер с просьбой агрегировать каждую из нужных метрик
// запросы воркер поставит в очередь
// по итогу полученные данные будем устанавливать в IndexedDB в качестве кэша

// ========== Events ==========

/**
 * Устанавливает текущую метрику (вызывается из компонента StatsGrid)
 */
export const setMetric = createEvent<Metrics>();

/**
 * Событие получения данных от worker-а
 */
export const workerMessageReceived = createEvent<{
    treeData: MetricDataMap;
    metric: Metrics;
}>();

/**
 * Внутреннее событие для установки данных в $rowData
 */
const setRowData = createEvent<MetricDataMap>();

/**
 * Событие для очистки данных сервера после завершения предзагрузки
 */
const clearServerData = createEvent();

// ========== Effects ==========

/**
 * Загружает данные с сервера через STATS_API
 */
export const loadServerDataFx = createEffect(async () => {
    const data = await STATS_API.getFull();
    console.log('Загружены данные с сервера:', data);
    return data;
});

/**
 * Отправляет данные в worker для обработки
 */
export const sendToWorkerFx = createEffect(({ worker, data, metric }: { worker: Worker; data: IStatItem[]; metric: Metrics }) => {
    console.log('Отправка данных в worker, метрика:', metric);
    worker.postMessage({ data, metric });
});

/**
 * Сохраняет обработанные данные в IndexedDB
 */
export const saveToIndexedDBFx = createEffect(async ({ metric, treeData }: { metric: Metrics; treeData: MetricDataMap }) => {
    await saveMetricData(indexedDB, metric, treeData, Date.now());
});

/**
 * Загружает данные для метрики из IndexedDB (кеш)
 * Проверяет актуальность кеша - данные должны быть загружены сегодня
 */
export const loadFromCacheFx = createEffect(async (metric: Metrics) => {
    const timestamp = await getMetricTimestamp(indexedDB, metric);

    if (!timestamp) {
        return null;
    }

    // Проверяем, что кеш создан сегодня (сравниваем даты в UTC)
    if (!isSameDay(timestamp, Date.now())) {
        const cachedDate = new Date(timestamp);
        console.log(`Кеш для метрики "${metric}" устарел (создан ${cachedDate.toLocaleDateString()}), игнорируем`);
        return null;
    }

    console.log(`Кеш для метрики "${metric}" актуален (создан сегодня)`);

    // Загружаем данные
    const treeData = await getMetricData(indexedDB, metric);
    return treeData;
});

/**
 * Предзагружает все метрики, кроме текущей
 */
export const preloadMetricsFx = createEffect(
    async ({ currentMetric, serverData, worker }: { currentMetric: Metrics; serverData: IStatItem[]; worker: Worker }) => {
        const allMetrics = Object.values(Metrics);
        const metricsToPreload = allMetrics.filter((m) => m !== currentMetric);

        console.log(`Предзагрузка: начало фоновой обработки метрик:`, metricsToPreload);

        // Предзагружаем метрики последовательно с интервалом 3 секунды
        for (const metric of metricsToPreload) {
            // Проверяем, есть ли актуальный кэш
            const timestamp = await getMetricTimestamp(indexedDB, metric);

            if (timestamp && isSameDay(timestamp, Date.now())) {
                console.log(`Предзагрузка: кэш для метрики "${metric}" актуален, пропускаем`);
                continue;
            }

            // Ждем 3 секунды перед отправкой
            await new Promise((resolve) => setTimeout(resolve, 3000));

            console.log('Отправка данных в worker, метрика:', metric);
            worker.postMessage({ data: serverData, metric });
        }
    },
);

/**
 * Запускает предзагрузку с проверкой наличия данных сервера
 * Если данных нет - сначала проверяет кэш всех метрик
 * Загружает с сервера только если есть метрики без актуального кэша
 */
export const startPreloadWithServerDataCheckFx = createEffect(async ({ serverData }: { serverData: IStatItem[] | null }) => {
    // Если данных с сервера нет
    if (!serverData || serverData.length === 0) {
        // Проверяем, есть ли актуальные кэши для всех метрик
        const allMetrics = Object.values(Metrics);
        let allCached = true;

        for (const metric of allMetrics) {
            const timestamp = await getMetricTimestamp(indexedDB, metric);
            if (!timestamp || !isSameDay(timestamp, Date.now())) {
                allCached = false;
                break;
            }
        }

        // Загружаем только если есть метрики без актуального кэша
        if (!allCached) {
            console.log('Предзагрузка: есть метрики без кэша, загружаем данные с сервера');
            serverData = await STATS_API.getFull();
        } else {
            console.log('Предзагрузка: все метрики уже в актуальном кэше, загрузка не требуется');
            return null; // Не нужно ничего предзагружать
        }
    }

    return serverData;
});

// ========== Stores ==========

/**
 * Текущая метрика (cost, revenue, orders, returns, buyouts)
 * Изначально null, устанавливается из компонента
 */
export const $metric = createStore<Metrics | null>(null).on(setMetric, (state, metric) => {
    // Если метрика не изменилась, не обновляем стор
    if (state === metric) {
        return state;
    }
    return metric;
});

/**
 * Данные с сервера (сырые данные из API)
 */
export const $serverData = createStore<IStatItem[] | null>(null)
    .on(loadServerDataFx.doneData, (_, data) => data)
    .reset(clearServerData);

/**
 * Обработанные данные для таблицы (результат работы worker-а или кеша)
 * Хранится как объект { [nodeId]: MetricNodeData } для быстрого доступа по ID
 */
export const $rowData = createStore<MetricDataMap | null>(null)
    .on(setRowData, (_, treeData) => {
        console.log('Получены обработанные данные от worker, узлов:', Object.keys(treeData).length);
        return treeData;
    })
    .on(loadFromCacheFx.doneData, (_, treeData) => {
        if (treeData) {
            console.log('Данные загружены из кеша IndexedDB, узлов:', Object.keys(treeData).length);
            return treeData;
        }
        return null; // Если кеша нет, сбрасываем данные
    })
    .reset(setMetric); // Сбрасываем данные при смене метрики

/**
 * Инстанс worker-а
 * Инициализируется сразу при загрузке модуля
 */
console.log('Инициализация worker');
const handleDataWorker = new HandleDataWorker();

handleDataWorker.onmessage = (e: MessageEvent) => {
    const { treeData, metric } = e.data;
    console.log('Получено сообщение от worker, метрика:', metric);
    workerMessageReceived({ treeData, metric });
};

handleDataWorker.onerror = (error: ErrorEvent) => {
    console.error('Ошибка worker:', error);
};

export const $worker = createStore<Worker>(handleDataWorker);

// ========== Logic (Samples) ==========

/**
 * При изменении метрики - пытаемся загрузить данные из кеша
 */
sample({
    clock: $metric,
    filter: (metric) => metric !== null,
    target: loadFromCacheFx,
});

/**
 * Обновляем $rowData только если данные от воркера пришли для текущей метрики
 */
sample({
    clock: workerMessageReceived,
    source: $metric,
    filter: (currentMetric, { metric }) => currentMetric === metric,
    fn: (_, { treeData }) => treeData,
    target: setRowData,
});

/**
 * Если кеша нет и данных с сервера нет - загружаем с сервера
 */
sample({
    clock: loadFromCacheFx.doneData,
    source: $serverData,
    filter: (serverData, cached) => {
        const noCache = cached === null;
        const noServerData = serverData === null || serverData.length === 0;

        if (!noCache) console.log('Данные есть в кеше, загрузка с сервера не требуется');
        if (noCache && !noServerData) console.log('Кеша нет, но данные с сервера уже загружены');
        if (noCache && noServerData) console.log('Кеша нет и данных с сервера нет, загружаем с сервера');

        return noCache && noServerData;
    },
    target: loadServerDataFx,
});

/**
 * Если кеша нет но данные с сервера есть - отправляем данные в worker для обработки
 */
sample({
    clock: loadFromCacheFx.doneData,
    source: {
        serverData: $serverData,
        metric: $metric,
        worker: $worker,
    },
    filter: ({ serverData, metric }, cached) => {
        const hasData = serverData !== null && serverData.length > 0;
        const hasMetric = metric !== null;
        const noCache = cached === null;

        if (!hasMetric) console.log('Метрика не установлена, ожидание установки метрики');
        if (!noCache) console.log('Данные загружены из кеша, пропуск обработки в worker');
        if (noCache && !hasData) console.log('Кеша нет и данных с сервера нет, ожидание загрузки');

        return hasData && hasMetric && noCache;
    },
    fn: ({ serverData, metric, worker }) => ({
        worker,
        data: serverData!,
        metric: metric!,
    }),
    target: sendToWorkerFx,
});

/**
 * После загрузки данных с сервера - сразу отправляем в worker
 * (кеша точно нет, иначе не загружали бы с сервера)
 */
sample({
    clock: loadServerDataFx.doneData,
    source: {
        metric: $metric,
        worker: $worker,
    },
    filter: ({ metric }) => metric !== null,
    fn: ({ metric, worker }, data) => ({
        worker,
        data,
        metric: metric!,
    }),
    target: sendToWorkerFx,
});

/**
 * Сохраняем данные в IndexedDB после получения от worker
 */
sample({
    clock: workerMessageReceived,
    fn: ({ metric, treeData }) => ({ metric, treeData }),
    target: saveToIndexedDBFx,
});

/**
 * Запускаем фоновую предзагрузку после успешной загрузки из кэша (если данные найдены)
 */
sample({
    clock: loadFromCacheFx.doneData,
    source: $serverData,
    filter: (_, cachedData) => cachedData !== null,
    fn: (serverData) => ({
        serverData,
    }),
    target: startPreloadWithServerDataCheckFx,
});

/**
 * Запускаем фоновую предзагрузку после сохранения текущей метрики в кэш
 */
sample({
    clock: saveToIndexedDBFx.done,
    source: {
        serverData: $serverData,
        currentMetric: $metric,
    },
    filter: ({ currentMetric }, { params }) => currentMetric === params.metric,
    fn: ({ serverData }) => ({
        serverData,
    }),
    target: startPreloadWithServerDataCheckFx,
});

/**
 * Запускаем агрегацию других метрик в воркере
 * Только если есть данные для обработки (не все метрики закэшированы)
 */
sample({
    clock: startPreloadWithServerDataCheckFx.doneData,
    source: {
        metric: $metric,
        worker: $worker,
    },
    filter: ({ metric }, serverData) => {
        const hasMetric = metric !== null;
        const hasData = serverData !== null && serverData.length > 0;

        return hasMetric && hasData;
    },
    fn: ({ metric, worker }, serverData) => ({
        currentMetric: metric!,
        serverData: serverData!,
        worker,
    }),
    target: preloadMetricsFx,
});

/**
 * Очищаем данные сервера после завершения предзагрузки всех метрик
 */
sample({
    clock: preloadMetricsFx.done,
    target: clearServerData,
});

// ========== Initialization ==========

// Данные загружаются по требованию при установке метрики
// Если есть кеш - используется кеш
// Если кеша нет - загружаются с сервера и обрабатываются в worker
// После сохранения текущей метрики в кэш - в фоне предзагружаются остальные метрики
