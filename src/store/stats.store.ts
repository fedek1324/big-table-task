import { createStore, createEvent, createEffect, sample } from 'effector';
import { IStatItem } from '../types/stats.types';
import { TreeNode } from '../types/tree.types';
import { STATS_API } from '../api/stats.api';
import { Metrics } from '../features/stats/stats.const';
import HandleDataWorker from '../features/stats/helpers/handleDataWorker?worker';

// ========== Events ==========

/**
 * Устанавливает текущую метрику (вызывается из компонента StatsGrid)
 */
export const setMetric = createEvent<string>();

/**
 * Событие получения данных от worker-а
 */
export const workerMessageReceived = createEvent<{
    treeData: Record<string, TreeNode>;
    requestId: number;
}>();

/**
 * Инициализация worker-а
 */
export const initWorker = createEvent();

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
    console.log('Загружены данные с сервера, записей:', data.length);
    return data;
});

/**
 * Отправляет данные в worker для обработки
 */
export const sendToWorkerFx = createEffect(
    ({
        worker,
        data,
        metric,
        requestId,
    }: {
        worker: Worker;
        data: IStatItem[];
        metric: string;
        requestId: number;
    }) => {
        console.log('Отправка данных в worker, метрика:', metric, 'requestId:', requestId);
        worker.postMessage({ data, metric, requestId });
    },
);

// ========== Stores ==========

/**
 * Текущая метрика (cost, revenue, orders, returns, buyouts)
 * Изначально устанавливается в 'cost'
 */
export const $metric = createStore<string>(Metrics.cost).on(setMetric, (_, metric) => metric);

/**
 * Данные с сервера (сырые данные из API)
 */
export const $serverData = createStore<IStatItem[] | null>(null).on(
    loadServerDataFx.doneData,
    (_, data) => data,
);

/**
 * Обработанные данные для таблицы (результат работы worker-а)
 */
export const $rowData = createStore<TreeNode[] | null>(null)
    .on(workerMessageReceived, (_, { treeData }) => {
        const treeArray = Object.values(treeData) as TreeNode[];
        console.log('Получены обработанные данные от worker, узлов:', treeArray.length);
        return treeArray;
    })
    .reset(setMetric); // Сбрасываем данные при смене метрики

/**
 * ID запроса для отслеживания актуальности ответов от worker-а
 */
export const $requestId = createStore<number>(0);

/**
 * Инстанс worker-а
 */
export const $worker = createStore<Worker | null>(null)
    .on(initWorker, (worker) => {
        if (worker) {
            console.log('Worker уже инициализирован');
            return worker;
        }

        console.log('Инициализация worker');
        const newWorker = new HandleDataWorker();

        newWorker.onmessage = (e: MessageEvent) => {
            const { treeData, requestId } = e.data;
            console.log('Получено сообщение от worker, requestId:', requestId);
            workerMessageReceived({ treeData, requestId });
        };

        newWorker.onerror = (error: ErrorEvent) => {
            console.error('Ошибка worker:', error);
        };

        return newWorker;
    })
    .on(terminateWorker, (worker) => {
        console.log('Завершение работы worker');
        worker?.terminate();
        return null;
    });

// ========== Logic (Samples) ==========

/**
 * При изменении serverData или metric - отправляем данные в worker
 */
sample({
    clock: [$serverData, $metric],
    source: {
        serverData: $serverData,
        metric: $metric,
        worker: $worker,
        requestId: $requestId,
    },
    filter: ({ serverData, worker }) => {
        const hasData = serverData !== null && serverData.length > 0;
        const hasWorker = worker !== null;
        if (!hasData) console.log('Нет данных с сервера, пропуск отправки в worker');
        if (!hasWorker) console.log('Worker не инициализирован, пропуск');
        return hasData && hasWorker;
    },
    fn: ({ serverData, metric, worker, requestId }) => ({
        worker: worker!,
        data: serverData!,
        metric,
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
