import { createStore, createEvent, createEffect, sample } from 'effector';
import { IStatItem } from '../types/stats.types';
import { Metrics } from '../types/metrics.types';
import { TreeNode } from '../types/tree.types';
import { STATS_API } from '../api/stats.api';
import HandleDataWorker from '../features/stats/helpers/handleDataWorker?worker';
import { initDB, saveMetricData, getMetricData } from './indexedDB';
import { isSameDay } from '../helpers/date.helpers';

const indexedDB = await initDB();

// Алгоритм
// При загрузке компонента с таблицей в стор устанавливается метрика
// При установке метрики проверяем кэш с данными по метрике, если кэш есть
// Кладём данные в стор rowData и отрисовываем
// Если кэша нет, то проверяем, если ли данные сервера в сторе,
// если нет, подгружаем данные с сервера и сохраняем в стор $serverData
// После того как данные будут загружены агрегируем с помощью воркера и кладём в $rowData
// (затирая данные стора по прежней метрике)

// ========== Events ==========

/**
 * Устанавливает текущую метрику (вызывается из компонента StatsGrid)
 */
export const setMetric = createEvent<Metrics>();

/**
 * Событие получения данных от worker-а
 */
export const workerMessageReceived = createEvent<{
    treeData: Record<string, TreeNode>;
    requestId: number;
}>();

/**
 * Завершение работы worker-а
 */
export const terminateWorker = createEvent();

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
export const sendToWorkerFx = createEffect(
    ({ worker, data, metric, requestId }: { worker: Worker; data: IStatItem[]; metric: Metrics; requestId: number }) => {
        console.log('Отправка данных в worker, метрика:', metric, 'requestId:', requestId);
        worker.postMessage({ data, metric, requestId });
    },
);

/**
 * Сохраняет обработанные данные в IndexedDB
 */
export const saveToIndexedDBFx = createEffect(async ({ metric, treeData }: { metric: Metrics; treeData: Record<string, TreeNode> }) => {
    await saveMetricData(indexedDB, metric, treeData, Date.now());
    console.log(`Данные для метрики "${metric}" сохранены в IndexedDB`);
});

/**
 * Загружает данные для метрики из IndexedDB (кеш)
 * Проверяет актуальность кеша - данные должны быть загружены сегодня
 */
export const loadFromCacheFx = createEffect(async (metric: Metrics) => {
    const cached = await getMetricData(indexedDB, metric);

    if (!cached) {
        return null;
    }

    // Проверяем, что кеш создан сегодня (сравниваем даты в UTC)
    if (!isSameDay(cached.timestamp, Date.now())) {
        const cachedDate = new Date(cached.timestamp);
        console.log(`Кеш для метрики "${metric}" устарел (создан ${cachedDate.toLocaleDateString()}), игнорируем`);
        return null;
    }

    console.log(`Кеш для метрики "${metric}" актуален (создан сегодня)`);
    return cached;
});

// ========== Stores ==========

/**
 * Текущая метрика (cost, revenue, orders, returns, buyouts)
 * Изначально null, устанавливается из компонента
 */
export const $metric = createStore<Metrics | null>(null).on(setMetric, (_, metric) => metric);

/**
 * Данные с сервера (сырые данные из API)
 */
export const $serverData = createStore<IStatItem[] | null>(null).on(loadServerDataFx.doneData, (_, data) => data);

/**
 * Обработанные данные для таблицы (результат работы worker-а или кеша)
 * Хранится как объект { [nodeId]: TreeNode } для быстрого доступа по ID
 */
export const $rowData = createStore<Record<string, TreeNode> | null>(null)
    .on(workerMessageReceived, (_, { treeData }) => {
        console.log('Получены обработанные данные от worker, узлов:', Object.keys(treeData).length);
        return treeData;
    })
    .on(loadFromCacheFx.doneData, (_, cached) => {
        if (cached) {
            console.log('Данные загружены из кеша IndexedDB, узлов:', Object.keys(cached.treeData).length);
            return cached.treeData;
        }
        return null; // Если кеша нет, сбрасываем данные
    })
    .reset(setMetric); // Сбрасываем данные при смене метрики

/**
 * ID запроса для отслеживания актуальности ответов от worker-а
 */
export const $requestId = createStore<number>(0);

/**
 * Инстанс worker-а
 * Инициализируется сразу при загрузке модуля
 */
console.log('Инициализация worker');
const handleDataWorker = new HandleDataWorker();

handleDataWorker.onmessage = (e: MessageEvent) => {
    const { treeData, requestId } = e.data;
    console.log('Получено сообщение от worker, requestId:', requestId);
    workerMessageReceived({ treeData, requestId });
};

handleDataWorker.onerror = (error: ErrorEvent) => {
    console.error('Ошибка worker:', error);
};

export const $worker = createStore<Worker>(handleDataWorker).on(terminateWorker, (worker) => {
    console.log('Завершение работы worker');
    worker.terminate();
    return handleDataWorker;
});

// ========== Logic (Samples) ==========

/**
 * При установке метрики - пытаемся загрузить данные из кеша
 */
sample({
    clock: setMetric,
    target: loadFromCacheFx,
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
        requestId: $requestId,
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
    fn: ({ serverData, metric, worker, requestId }) => ({
        worker,
        data: serverData!,
        metric: metric!,
        requestId: requestId + 1,
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
        requestId: $requestId,
    },
    filter: ({ metric }) => metric !== null,
    fn: ({ metric, worker, requestId }, data) => ({
        worker,
        data,
        metric: metric!,
        requestId: requestId + 1,
    }),
    target: sendToWorkerFx,
});

/**
 * Сохраняем данные в IndexedDB после получения от worker
 */
sample({
    clock: workerMessageReceived,
    source: $metric,
    filter: (metric) => metric !== null,
    fn: (metric, { treeData }) => ({ metric: metric!, treeData }),
    target: saveToIndexedDBFx,
});

/**
 * Увеличиваем requestId при каждой отправке в worker
 */
$requestId.on(sendToWorkerFx, (id) => id + 1);

// ========== Initialization ==========

// Данные загружаются по требованию при установке метрики
// Если есть кеш - используется кеш
// Если кеша нет - загружаются с сервера и обрабатываются в worker
