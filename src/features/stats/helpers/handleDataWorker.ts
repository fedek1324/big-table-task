import { IStatItem } from '../../../types/stats.types';
import { processData } from './dataHandleHelpers';

console.log('handleDataWorker imported');

/**
 * Фильтрует данные, оставляя только последние 30 дней от сегодняшней даты.
 * Возвращает массивы длиной ровно 30, дополняя undefined с начала если нужно.
 *
 * Логика:
 * - cost[0] соответствует дате lastUpdate
 * - cost[1] соответствует lastUpdate минус 1 день
 * - cost[i] соответствует lastUpdate минус i дней
 *
 * Если lastUpdate был 2 дня назад (daysDiff = 2):
 * - Берём элементы с индекса 0 до 28 (28 элементов: от 2 до 29 дней назад)
 * - Дополняем 2 элемента undefined в начало (для 0 и 1 дня назад)
 * - Итого: [undefined, undefined, cost[0], cost[1], ..., cost[27]] - всего 30 элементов
 *
 * @param items - массив IStatItem с бэкенда
 * @returns массив FilteredStatItem без поля lastUpdate с массивами длиной 30
 */

onmessage = function (e) {
    const { data, metric, requestId } = e.data;

    console.log('HandleDataWorker: Starting data processing for metric:', metric, 'requestId:', requestId);

    const result = processData(data as IStatItem[], metric, requestId);
    const treeObject = result.treeData;

    postMessage({
        treeData: treeObject,
        requestId,
    });
};
