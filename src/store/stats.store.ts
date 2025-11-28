import { createStore, createEvent, createEffect, sample } from 'effector';
import { IStatItem } from '../types/stats.types';
import { Metrics } from '../types/metrics.types';
import { TreeNode } from '../types/tree.types';
import { STATS_API } from '../api/stats.api';
import HandleDataWorker from '../features/stats/helpers/handleDataWorker?worker';

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
 * Обработанные данные для таблицы (результат работы worker-а)
 * Хранится как объект { [nodeId]: TreeNode } для быстрого доступа по ID
 */
export const $rowData = createStore<Record<string, TreeNode> | null>(null)
    .on(workerMessageReceived, (_, { treeData }) => {
        console.log('Получены обработанные данные от worker, узлов:', Object.keys(treeData).length);
        return treeData;
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
 * При изменении serverData или metric - отправляем данные в worker
 * Данные отправляются только после того, как метрика была явно установлена
 */
sample({
    clock: [$serverData, $metric],
    source: {
        serverData: $serverData,
        metric: $metric,
        worker: $worker,
        requestId: $requestId,
    },
    filter: ({ serverData, metric }) => {
        const hasData = serverData !== null && serverData.length > 0;
        const hasMetric = metric !== null;
        if (!hasData) console.log('Нет данных с сервера, пропуск отправки в worker');
        if (!hasMetric) console.log('Метрика не установлена, ожидание установки метрики');
        return hasData && hasMetric;
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
 * Увеличиваем requestId при каждой отправке в worker
 */
$requestId.on(sendToWorkerFx, (id) => id + 1);

// ========== Initialization ==========

/**
 * Загружаем данные с сервера при инициализации модуля
 */
loadServerDataFx();
