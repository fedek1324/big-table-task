import { createStore, createEvent, createEffect, sample } from 'effector';
import { IStatItem } from '../types/stats.types';
import { Metrics } from '../types/metrics.types';
import { MetricDataMap } from '../types/metric.types';
import { STATS_API } from '../api/stats.api';
import HandleDataWorker from '../features/stats/helpers/handleDataWorker?worker';
import { initDB, saveMetricData, getMetricData, getMetricTimestamp } from './indexedDB';
import { isSameDay } from '../helpers/date.helpers';

// Алгоритм работы с очередью метрик:
// 1. При первой установке метрики проверяем кэш и создаём очередь метрик которые нужно вычислить
//    Установленную метрику ставим первой в очереди
// 2. При смене метрики:
//    - Если вся очередь была посчитана → возвращаем из кэша
//    - Если не вся очередь посчитана:
//      - Если установленная метрика сейчас в выполнении → ждём
//      - Если установленная метрика не в выполнении → прерываем worker, создаём новую очередь
//        (установленная метрика первая) и запускаем

const indexedDB = await initDB();

/**
 * Создает и настраивает новый экземпляр worker
 */
function createWorkerInstance(): Worker {
    const worker = new HandleDataWorker();

    worker.onmessage = (e: MessageEvent) => {
        const { treeData, metric } = e.data;
        console.log('Получено сообщение от worker, метрика:', metric);
        workerMessageReceived({ treeData, metric });
    };

    worker.onerror = (error: ErrorEvent) => {
        console.error('Ошибка worker:', error);
    };

    return worker;
}

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

/**
 * Событие для инкремента индекса (переход к следующей метрике)
 */
const incrementProcessingIndex = createEvent();

// ========== Effects ==========

/**
 * Загружает данные с сервера через STATS_API
 */
export const loadServerDataFx = createEffect(async () => {
    const data = await STATS_API.getFull();
    console.log('Данные с сервера загружены, записей:', data.length);
    return data;
});

/**
 * Сохраняет обработанные данные в IndexedDB
 */
export const saveToIndexedDBFx = createEffect(async ({ metric, treeData }: { metric: Metrics; treeData: MetricDataMap }) => {
    await saveMetricData(indexedDB, metric, treeData, Date.now());
    console.log(`Метрика "${metric}" сохранена в кэш`);
    return metric;
});

/**
 * Загружает данные для метрики из IndexedDB (кеш)
 * Проверяет актуальность кеша - данные должны быть загружены сегодня
 */
export const loadFromCacheFx = createEffect(async (metric: Metrics) => {
    const timestamp = await getMetricTimestamp(indexedDB, metric);

    if (!timestamp || !isSameDay(timestamp, Date.now())) {
        console.log(`Кэш для метрики "${metric}" отсутствует или устарел`);
        return null;
    }

    const treeData = await getMetricData(indexedDB, metric);
    console.log(`Данные для метрики "${metric}" загружены из кэша`);
    return treeData;
});

/**
 * Создаёт очередь метрик для вычисления и пересоздаёт worker если нужно
 * Проверяет кэш всех метрик и формирует очередь из тех, которых нет в кэше
 * Текущую метрику ставит первой в очереди
 */
export const createMetricsQueueFx = createEffect(
    async ({ metric: currentMetric, worker: currentWorker }: { metric: Metrics; worker: Worker | null }) => {
        const allMetrics = Object.values(Metrics);
        const metricsWithoutCache: Metrics[] = [];

        for (const metric of allMetrics) {
            const timestamp = await getMetricTimestamp(indexedDB, metric);
            if (!timestamp || !isSameDay(timestamp, Date.now())) {
                metricsWithoutCache.push(metric);
            }
        }

        // Если очередь не пустая - пересоздаём worker
        currentWorker?.terminate();
        const newWorker = createWorkerInstance();

        // Переставляем текущую метрику на первое место
        const currentIndex = metricsWithoutCache.indexOf(currentMetric);
        if (currentIndex > -1) {
            metricsWithoutCache.splice(currentIndex, 1);
            metricsWithoutCache.unshift(currentMetric);
        }

        console.log('Создана очередь метрик:', metricsWithoutCache);
        return { queue: metricsWithoutCache, worker: newWorker };
    },
);

/**
 * Обрабатывает следующую метрику из очереди и вызывает worker.postMessage
 */
export const processNextMetricFx = createEffect(
    async ({ queue, index, serverData, worker }: { queue: Metrics[]; index: number; serverData: IStatItem[]; worker: Worker | null }) => {
        if (index >= queue.length) {
            return null;
        }

        if (!worker) {
            console.warn('Worker должен быть инициализирован');
            return;
        }

        const metric = queue[index];
        console.log(`Обработка метрики ${index + 1}/${queue.length}: ${metric}`);
        worker.postMessage({ data: serverData, metric });

        return metric;
    },
);

// ========== Stores ==========

/**
 * Текущая метрика (cost, revenue, orders, returns, buyouts)
 * Изначально null, устанавливается из компонента
 */
export const $metric = createStore<Metrics | null>(null).on(setMetric, (_, metric) => metric);

/**
 * Данные с сервера (сырые данные из API)
 */
export const $serverData = createStore<IStatItem[] | null>(null)
    .on(loadServerDataFx.doneData, (_, data) => data)
    .reset(clearServerData);

/**
 * Обработанные данные для таблицы (результат работы worker-а или кеша)
 */
export const $rowData = createStore<MetricDataMap | null>(null)
    .on(setRowData, (_, treeData) => treeData)
    .on(loadFromCacheFx.doneData, (_, treeData) => (treeData ? treeData : null))
    .reset(setMetric);

/**
 * Очередь метрик для вычисления
 * Содержит метрики, которые нужно обработать
 */
export const $metricsQueue = createStore<Metrics[]>([]).on(createMetricsQueueFx.doneData, (_, { queue }) => queue);

/**
 * Индекс текущей обрабатываемой метрики в очереди
 * 0 = первая метрика в очереди
 * metricQueue.length = вся очередь обработана
 */
export const $processingIndex = createStore<number>(0)
    .on(incrementProcessingIndex, (index) => index + 1)
    .on(createMetricsQueueFx.doneData, () => 0);

export const $worker = createStore<Worker | null>(null).on(createMetricsQueueFx.doneData, (_, { worker }) => worker);

/**
 * Флаг загрузки данных
 * true - если загружается кэш, загружаются данные с сервера или обрабатывается worker
 */
export const $isLoading = createStore<boolean>(false)
    .on(setMetric, () => true)
    .on(loadFromCacheFx.doneData, (_, cachedData) => (cachedData ? false : true))
    .on(setRowData, () => false)
    .on(createMetricsQueueFx.doneData, (_, { queue }) => (queue.length === 0 ? false : true));

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
 * Если кэша нет - проверяем состояние очереди и создаём очередь метрик
 */
sample({
    clock: loadFromCacheFx.doneData,
    source: {
        metric: $metric,
        queue: $metricsQueue,
        processingIndex: $processingIndex,
        worker: $worker,
    },
    filter: ({ metric, queue, processingIndex }, cachedData) => {
        if (cachedData !== null || metric === null) return false;

        // Если не получилось загрузить из кэша проверяем, вдруг сейчас
        // уже обрабатывается нужная метрика
        const queueEmpty = queue.length === 0;
        const queueInProgress = processingIndex < queue.length;
        const currentMetricInProgress = queue[processingIndex];
        const isCurrentMetricInProgress = queueInProgress && currentMetricInProgress === metric;

        const shouldRecreate = queueEmpty || !isCurrentMetricInProgress;

        if (shouldRecreate) {
            console.log(queueEmpty ? 'Инициализация очереди' : 'Пересоздание очереди для:', metric);
        }

        return shouldRecreate;
    },
    fn: ({ metric, worker }) => ({ metric: metric!, worker }),
    target: createMetricsQueueFx,
});

/**
 * Если очередь создана и нет данных с сервера - загружаем их
 */
sample({
    clock: createMetricsQueueFx.doneData,
    source: $serverData,
    filter: (serverData) => serverData === null || serverData.length === 0,
    target: loadServerDataFx,
});

/**
 * Обработка следующей метрики из очереди
 * Срабатывает после загрузки данных, создания очереди или инкремента индекса
 */
sample({
    clock: [loadServerDataFx.doneData, createMetricsQueueFx.doneData, incrementProcessingIndex],
    source: {
        queue: $metricsQueue,
        serverData: $serverData,
        index: $processingIndex,
        worker: $worker,
    },
    filter: ({ serverData, index, queue }) => {
        const hasData = serverData !== null && serverData.length > 0;
        const canProcess = index < queue.length;

        if (!canProcess) {
            console.log('Вся очередь обработана');
        }

        return hasData && canProcess;
    },
    fn: ({ queue, serverData, index, worker }) => ({
        queue,
        index,
        serverData: serverData!,
        worker,
    }),
    target: processNextMetricFx,
});

/**
 * Обрабатываем данные от worker: всегда сохраняем в IndexedDB и обновляем rowData для текущей метрики
 */
sample({
    clock: workerMessageReceived,
    fn: ({ metric, treeData }) => ({ metric, treeData }),
    target: saveToIndexedDBFx,
});

sample({
    clock: workerMessageReceived,
    source: $metric,
    filter: (currentMetric, { metric }) => currentMetric === metric,
    fn: (_, { treeData }) => treeData,
    target: setRowData,
});

/**
 * После сохранения в кэш - инкрементируем индекс
 */
sample({
    clock: saveToIndexedDBFx.doneData,
    target: incrementProcessingIndex,
});

/**
 * Если сохранили метрику которая сейчас выбрана и данные ещё не загружены - загружаем из кэша
 * Это нужно для race condition когда метрика была посчитана до переключения на неё
 */
sample({
    clock: saveToIndexedDBFx.doneData,
    source: {
        currentMetric: $metric,
        rowData: $rowData,
    },
    filter: ({ currentMetric, rowData }, savedMetric) => {
        return currentMetric === savedMetric && rowData === null;
    },
    fn: ({ currentMetric }) => currentMetric!,
    target: loadFromCacheFx,
});

/**
 * После завершения обработки всей очереди - очищаем данные сервера
 */
sample({
    clock: incrementProcessingIndex,
    source: {
        queue: $metricsQueue,
        index: $processingIndex,
    },
    filter: ({ queue, index }) => index >= queue.length,
    target: clearServerData,
});
