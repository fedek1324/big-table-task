import { createStore, createEvent, createEffect, sample, split } from 'effector';
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
//      - Если метрика сейчас в выполнении → ждём
//      - Если метрика не в выполнении → прерываем worker, создаём новую очередь
//        (эта метрика первая) и запускаем

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

/**
 * Инстанс worker-а
 */
const handleDataWorker = createWorkerInstance();

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

/**
 * Событие для обработки очереди когда данные сервера уже доступны
 */
const processQueueWithExistingData = createEvent<Metrics[]>();

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
 * Создаёт очередь метрик для вычисления
 * Проверяет кэш всех метрик и формирует очередь из тех, которых нет в кэше
 * Текущую метрику ставит первой в очереди
 */
export const createMetricsQueueFx = createEffect(async (currentMetric: Metrics) => {
    const allMetrics = Object.values(Metrics);
    const metricsWithoutCache: Metrics[] = [];

    for (const metric of allMetrics) {
        const timestamp = await getMetricTimestamp(indexedDB, metric);
        if (!timestamp || !isSameDay(timestamp, Date.now())) {
            metricsWithoutCache.push(metric);
        }
    }

    if (metricsWithoutCache.length === 0) {
        console.log('Все метрики в актуальном кэше');
        return [];
    }

    // Переставляем текущую метрику на первое место
    const currentIndex = metricsWithoutCache.indexOf(currentMetric);
    if (currentIndex > -1) {
        metricsWithoutCache.splice(currentIndex, 1);
        metricsWithoutCache.unshift(currentMetric);
    }

    console.log('Создана очередь метрик:', metricsWithoutCache);
    return metricsWithoutCache;
});

/**
 * Обрабатывает следующую метрику из очереди
 */
export const processNextMetricFx = createEffect(
    async ({ queue, index, serverData, worker }: { queue: Metrics[]; index: number; serverData: IStatItem[]; worker: Worker }) => {
        if (index >= queue.length) {
            return null;
        }

        const metric = queue[index];
        console.log(`Обработка метрики ${index + 1}/${queue.length}: ${metric}`);
        worker.postMessage({ data: serverData, metric });

        return metric;
    },
);

/**
 * Прерывает текущий worker и создаёт новый
 */
export const recreateWorkerFx = createEffect((metric: Metrics) => {
    const currentWorker = $worker.getState();
    currentWorker.terminate();

    const newWorker = createWorkerInstance();

    return { worker: newWorker, metric };
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
 */
export const $rowData = createStore<MetricDataMap | null>(null)
    .on(setRowData, (_, treeData) => treeData)
    .on(loadFromCacheFx.doneData, (_, treeData) => (treeData ? treeData : null))
    .reset(setMetric);

/**
 * Очередь метрик для вычисления
 * Содержит метрики, которые нужно обработать
 */
export const $metricsQueue = createStore<Metrics[]>([]).on(createMetricsQueueFx.doneData, (_, queue) => queue);

/**
 * Индекс текущей обрабатываемой метрики в очереди
 * 0 = первая метрика в очереди
 * metricQueue.length = вся очередь обработана
 */
export const $processingIndex = createStore<number>(0)
    .on(incrementProcessingIndex, (index) => index + 1)
    .on(createMetricsQueueFx.doneData, () => 0);

export const $worker = createStore<Worker>(handleDataWorker).on(recreateWorkerFx.doneData, (_, { worker }) => worker);

/**
 * Флаг загрузки данных
 * true - если загружается кэш, загружаются данные с сервера или обрабатывается worker
 */
export const $isLoading = createStore<boolean>(false)
    .on(setMetric, () => true)
    .on(loadFromCacheFx.doneData, (_, cachedData) => (cachedData ? false : true))
    .on(setRowData, () => false);

// ========== Logic (Samples) ==========

/**
 * Результат проверки кэша - содержит метрику и флаг необходимости пересоздания
 */
const checkCache = createEvent<{ metric: Metrics; shouldRecreate: boolean }>();

/**
 * При изменении метрики - пытаемся загрузить данные из кеша
 */
sample({
    clock: $metric,
    filter: (metric) => metric !== null,
    target: loadFromCacheFx,
});

/**
 * Если кэша нет - проверяем состояние очереди и принимаем решение
 */
sample({
    clock: loadFromCacheFx.doneData,
    source: {
        metric: $metric,
        queue: $metricsQueue,
        processingIndex: $processingIndex,
    },
    filter: ({ metric }, cachedData) => cachedData === null && metric !== null,
    fn: ({ metric, queue, processingIndex }) => {
        const queueEmpty = queue.length === 0;
        const queueInProgress = processingIndex < queue.length;
        const currentMetric = queue[processingIndex];
        const isCurrentMetric = queueInProgress && currentMetric === metric;

        const shouldRecreate = queueEmpty || !isCurrentMetric;

        if (shouldRecreate) {
            console.log(queueEmpty ? 'Инициализация очереди' : 'Пересоздание очереди', 'для:', metric);
        }

        return { metric: metric!, shouldRecreate };
    },
    target: checkCache,
});

/**
 * Разделяем логику: если нужно пересоздать worker - пересоздаём, иначе ничего не делаем
 */
split({
    source: checkCache,
    match: ({ shouldRecreate }) => (shouldRecreate ? 'recreate' : '__'),
    cases: {
        recreate: recreateWorkerFx.prepend((data: { metric: Metrics; shouldRecreate: boolean }) => data.metric),
    },
});

/**
 * После пересоздания worker создаём новую очередь
 */
sample({
    clock: recreateWorkerFx.doneData,
    fn: ({ metric }) => metric,
    target: createMetricsQueueFx,
});

/**
 * Разделение логики обработки очереди в зависимости от наличия данных с сервера
 * Используем split из effector для упрощения кода
 */
split({
    source: createMetricsQueueFx.doneData,
    match: (queue: Metrics[]) => {
        if (queue.length === 0) return '__';

        const serverData = $serverData.getState();
        const noServerData = serverData === null || serverData.length === 0;

        if (noServerData) {
            return 'needServerData';
        }

        const index = $processingIndex.getState();
        if (index < queue.length) {
            return 'hasServerData';
        }

        return '__';
    },
    cases: {
        needServerData: loadServerDataFx,
        hasServerData: processQueueWithExistingData,
    },
});

/**
 * Обработка метрики после загрузки данных или если данные уже доступны
 * Объединяем оба случая в один sample с массивом clock
 */
sample({
    clock: [loadServerDataFx.doneData, processQueueWithExistingData],
    source: {
        queue: $metricsQueue,
        serverData: $serverData,
        index: $processingIndex,
        worker: $worker,
    },
    filter: ({ serverData, index, queue }) => {
        const hasData = serverData !== null && serverData.length > 0;
        const canProcess = index < queue.length;
        const queueNotEmpty = queue.length > 0;
        return hasData && canProcess && queueNotEmpty;
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
 * Обновляем $rowData если данные от воркера пришли для текущей метрики
 */
sample({
    clock: workerMessageReceived,
    source: $metric,
    filter: (currentMetric, { metric }) => currentMetric === metric,
    fn: (_, { treeData }) => treeData,
    target: setRowData,
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
 * После сохранения в кэш - инкрементируем индекс и обрабатываем следующую метрику
 */
sample({
    clock: saveToIndexedDBFx.doneData,
    target: incrementProcessingIndex,
});

/**
 * После инкремента индекса - обрабатываем следующую метрику из очереди
 */
sample({
    clock: incrementProcessingIndex,
    source: {
        queue: $metricsQueue,
        index: $processingIndex,
        serverData: $serverData,
        worker: $worker,
    },
    filter: ({ queue, index, serverData }) => {
        const hasMore = index < queue.length;
        const hasData = serverData !== null && serverData.length > 0;

        if (!hasMore && queue.length > 0) {
            console.log('Вся очередь обработана');
        }

        return hasMore && hasData;
    },
    fn: ({ queue, index, serverData, worker }) => ({
        queue,
        index,
        serverData: serverData!,
        worker,
    }),
    target: processNextMetricFx,
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

// ========== Initialization ==========

// Данные загружаются по требованию при установке метрики
// Если есть кеш - используется кеш
// Если кеша нет - создаётся очередь метрик для обработки
// Все метрики из очереди обрабатываются последовательно
// После обработки каждой метрики - данные сохраняются в кэш
