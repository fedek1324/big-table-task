import { IStatItem } from '../../../types/stats.types';
import { MetricDataMap, MetricNodeData, createNodeId } from '../../../types/metric.types';
import { Metrics } from '../../../types/metrics.types';

// Общий алгоритм для обработки аддитивных метрик
// 1) Берем артикул и с учётом lastUpdate меняем массив данных по метрике
// 2) Мы должны получить плоскую структуру объектов с id и childIds[]:
// Пробегаемся по массиву данных с сервера, по товарам (артикулам)
// Будем на их основе создавать новые объекты а для старых вызывать delete
// Берём поставщика товара, и проверяем если его нет в общем объекте, если нет добавляем
// Потом берём бренд и добавляем в объект, если нет.
// И добавляем его id к childId поставщика если бренд не был учтён.
// И так же с типом товара
// Так же для типа
// Ну и в итоге создаём объект для артикула с данными нужной нам метрики
// 3) В этой же итерации цикла проходим по всем данным метрики товара и
// увеличиваем суммы для типа товара (передаём данные вверх)
// 4) После того как прошли все товары, проводим агрегацию
// Сначала для типов считаем сумму по датам (которые считали при обходе товаров)
// и среднее по датам
// типы легко найти перебирая собранные ИД поставщиков, потом бренды
// потом считаем сумму и среднее для брендов суммируя суммы по типам и после вычисляем среднее
// потом так же для поставщиков

// Создаём функцию для формирования массива с undefined в начале
const padArray = (arr: number[], elementsToTake: number): (number | undefined)[] => {
    return Array(30 - elementsToTake)
        .fill(undefined)
        .concat(arr.slice(0, elementsToTake));
};

// /**
//  * Извлекает данные по дням для конкретной метрики из FilteredStatItem
//  * Сохраняет undefined для дней без данных
//  */
// function getMetricData(item: IStatItem, metric: string): (number | undefined)[] {
//     switch (metric) {
//         case Metrics.cost:
//             return item.cost;
//         case Metrics.orders:
//             return item.orders;
//         case Metrics.returns:
//             return item.returns;
//         case Metrics.buyouts:
//             return item.orders.map((ordersCount, idx) => {
//                 if (ordersCount === undefined || item.returns[idx] === undefined) return undefined;
//                 return ordersCount - item.returns[idx];
//             });
//         case Metrics.revenue:
//             return item.orders.map((order, idx) => {
//                 if (order === undefined || item.returns[idx] === undefined || item.cost[idx] === undefined) return undefined;
//                 const buyout = order - item.returns[idx];
//                 return item.cost[idx]! * buyout;
//             });
//         default:
//             return item.cost;
//     }
// }

/**
 * Главная функция обработки данных - объединяет все шаги
 */
export function processData(data: IStatItem[], metric: Metrics): { treeData: MetricDataMap } {
    console.time('processingData');

    // TODO мы в метрике сохраняем список товаров брендов и тд
    // а можно хранить только данные
    const allMetricData: MetricDataMap = {};
    const levelIds: Array<Array<string>> = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Устанавливаем на начало дня

    for (let i = 0; i < data.length; i++) {
        const good = data[i];
        const { supplier, brand, type, article, lastUpdate } = good;

        // Создаём id узла
        const newGoodId = createNodeId(supplier, brand, type, article);

        // 1) Получаем новый массив с данными метрики за последние 30 дней включая сегодня
        const lastUpdateDate = new Date(lastUpdate);
        lastUpdateDate.setHours(0, 0, 0, 0);
        // Вычисляем сколько дней прошло с lastUpdate до сегодня
        const daysDiff = Math.floor((today.getTime() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24));
        // Определяем сколько элементов нужно взять из массивов
        // cost[0] = lastUpdate (это daysDiff дней назад от сегодня)
        // Хотим взять данные за последние 30 дней включительно
        const elementsToTake = Math.max(0, 30 - daysDiff);

        let metricData: MetricNodeData['metricData'];
        if (metric === Metrics.buyouts) {
            // TODO optimize
            const orders = padArray(good.orders, elementsToTake);
            const returns = padArray(good.returns, elementsToTake);
            metricData = orders.map((order, idx) => {
                const ret = returns[idx];
                if (order === undefined || ret === undefined) return undefined;
                return order - ret;
            });
        } else if (metric === Metrics.revenue) {
            const orders = padArray(good.orders, elementsToTake);
            const returns = padArray(good.returns, elementsToTake);
            const costs = padArray(good.cost, elementsToTake);
            metricData = orders.map((order, idx) => {
                if (order === undefined || returns[idx] === undefined || costs[idx] === undefined) return undefined;
                const buyout = (order - returns[idx]) * costs[idx];
                return buyout;
            });
        } else if (metric === Metrics.cost) {
            metricData = padArray(good.cost, elementsToTake);
        } else if (metric === Metrics.orders) {
            metricData = padArray(good.orders, elementsToTake);
        } else if (metric === Metrics.returns) {
            metricData = padArray(good.returns, elementsToTake);
        } else {
            const _exhaustive: never = metric;
            console.log(`Unknown metric: ${metric}`);
            metricData = [];
        }

        // Вычисляем сумму и серднее по всей метрике
        const metricSum = metricData.reduce<number>((acc, val) => acc + (val ?? 0), 0);
        const metricAverage = metricSum / elementsToTake;

        // 2) Мы должны получить плоскую структуру объектов с id и childIds[]
        const idSplit = newGoodId.split(':');
        let totalLevelId = '';
        for (let i = 0; i < idSplit.length; i++) {
            totalLevelId += (i > 0 ? ':' : '') + idSplit[i];

            const isNewNode = allMetricData[totalLevelId] === undefined;

            if (isNewNode) {
                // Создаём объект уровня
                const newNodeId = totalLevelId;
                const nodeData: MetricNodeData = {
                    childIds: [],
                    metricData: new Array(30).fill(undefined),
                    sum: undefined,
                    average: undefined,
                };
                allMetricData[newNodeId] = nodeData;

                if (i === idSplit.length - 1) {
                    // товар
                    nodeData.metricData = metricData;
                    nodeData.sum = metricSum;
                    nodeData.average = metricAverage;
                } else {
                    // запоминаем id групп для агрегации
                    if (levelIds[i] === undefined) {
                        levelIds[i] = [];
                    }
                    levelIds[i].push(newNodeId);
                }

                // Добавляем новый узел в childIds родителя
                if (i > 0) {
                    const parentId = totalLevelId.split(':').slice(0, -1).join(':');
                    allMetricData[parentId].childIds.push(totalLevelId);
                }
            }
        }

        // 3) Агрегируем данные вверх на 1 уровень в metricData
        const goodParentId = newGoodId.split(':').slice(0, -1).join(':');
        const parent = allMetricData[goodParentId];
        parent.metricData = metricData.map((dayNumber, i) => {
            if (dayNumber === undefined) {
                return parent.metricData[i];
            } else {
                return (parent.metricData[i] ?? 0) + dayNumber;
            }
        });
    }

    // 4) После того как прошли все товары, проводим полную агрегацию
    for (let i = levelIds.length - 1; i >= 0; i--) {
        const groupIds = levelIds[i];
        if (i === levelIds.length - 1) {
            // Если это уровень самых маленьких групп где по датам уже посчитали на уровне товаров
            // Агрегируем только сумму и среднее
            for (let j = 0; j < groupIds.length; j++) {
                const smallGroupId = groupIds[j];
                const smallGroup = allMetricData[smallGroupId];
                let filledDaysCount = 0;
                let sum = 0;
                // Считаем сумму и количество непустых дней
                for (let k = 0; k < smallGroup.metricData.length; k++) {
                    const dayNumber = smallGroup.metricData[k];
                    if (dayNumber !== undefined) {
                        filledDaysCount++;
                        sum += dayNumber;
                    }
                }
                const average = filledDaysCount > 0 ? sum / filledDaysCount : undefined;
                smallGroup.sum = sum;
                smallGroup.average = average;
            }
        } else {
            // Проходим по группам и агрегируем данные от детей
            for (let j = 0; j < groupIds.length; j++) {
                const groupId = groupIds[j];
                const group = allMetricData[groupId];
                const childIds = group.childIds;

                // Инициализируем массив для агрегации
                group.metricData = new Array(30).fill(undefined);

                // Агрегируем данные от всех детей по дням
                for (let k = 0; k < childIds.length; k++) {
                    const childId = childIds[k];
                    const childData = allMetricData[childId].metricData;

                    // Суммируем данные по каждому дню
                    for (let day = 0; day < 30; day++) {
                        const childValue = childData[day];
                        if (childValue !== undefined) {
                            group.metricData[day] = (group.metricData[day] ?? 0) + childValue;
                        }
                    }
                }

                // Вычисляем сумму и среднее
                let sum = 0;
                let filledDaysCount = 0;
                for (let k = 0; k < group.metricData.length; k++) {
                    const dayNumber = group.metricData[k];
                    if (dayNumber !== undefined) {
                        filledDaysCount++;
                        sum += dayNumber;
                    }
                }

                group.sum = sum;
                group.average = filledDaysCount > 0 ? sum / filledDaysCount : undefined;
            }
        }
    }

    console.timeEnd('processingData');

    return { treeData: allMetricData };
}

// // Тип для данных без lastUpdate после фильтрации
// // Массивы могут содержать undefined для дней, где нет данных
// export type FilteredStatItem = {
//     article: string;
//     type: string;
//     brand: string;
//     supplier: string;
//     cost: (number | undefined)[];
//     orders: (number | undefined)[];
//     returns: (number | undefined)[];
//     revenue?: (number | undefined)[];
//     buyouts?: (number | undefined)[];
//     sums?: IStatItem['sums'];
//     average?: IStatItem['average'];
// };

// /**
//  * Фильтрует данные, оставляя только последние 30 дней от сегодняшней даты.
//  * Возвращает массивы длиной ровно 30, дополняя undefined с начала если нужно.
//  *
//  * Логика:
//  * - cost[0] соответствует дате lastUpdate
//  * - cost[1] соответствует lastUpdate минус 1 день
//  * - cost[i] соответствует lastUpdate минус i дней
//  *
//  * Если lastUpdate был 2 дня назад (daysDiff = 2):
//  * - Берём элементы с индекса 0 до 28 (28 элементов: от 2 до 29 дней назад)
//  * - Дополняем 2 элемента undefined в начало (для 0 и 1 дня назад)
//  * - Итого: [undefined, undefined, cost[0], cost[1], ..., cost[27]] - всего 30 элементов
//  *
//  * @param items - массив IStatItem с бэкенда
//  * @returns массив FilteredStatItem без поля lastUpdate с массивами длиной 30
//  */
// export function filterLast30Days(items: IStatItem[]): FilteredStatItem[] {
//     const today = new Date();
//     today.setHours(0, 0, 0, 0); // Устанавливаем на начало дня

//     return items.map((item) => {
//         const lastUpdateDate = new Date(item.lastUpdate);
//         lastUpdateDate.setHours(0, 0, 0, 0);

//         // Вычисляем сколько дней прошло с lastUpdate до сегодня
//         const daysDiff = Math.floor((today.getTime() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24));

//         // Определяем сколько элементов нужно взять из массивов
//         // cost[0] = lastUpdate (это daysDiff дней назад от сегодня)
//         // Хотим взять данные за последние 30 дней включительно
//         const elementsToTake = Math.max(0, 30 - daysDiff);

//         // Сколько элементов undefined нужно добавить в начало
//         const undefinedCount = daysDiff;

//         // Создаём функцию для формирования массива с undefined в начале
//         const padArray = (arr: number[] | undefined, count: number): (number | undefined)[] => {
//             if (!arr) return new Array(30).fill(undefined);
//             const sliced = arr.slice(0, count);
//             const padding = new Array(Math.min(undefinedCount, 30)).fill(undefined);
//             return [...padding, ...sliced].slice(0, 30);
//         };

//         // Обрезаем массивы данных
//         const { lastUpdate, ...itemWithoutLastUpdate } = item;

//         return {
//             ...itemWithoutLastUpdate,
//             cost: padArray(item.cost, elementsToTake) as number[],
//             orders: padArray(item.orders, elementsToTake) as number[],
//             returns: padArray(item.returns, elementsToTake) as number[],
//             revenue: padArray(item.revenue, elementsToTake) as number[],
//             buyouts: padArray(item.buyouts, elementsToTake) as number[],
//         };
//     });
// }

// /**
//  * Строит иерархическое дерево из плоского массива IStatItem
//  *
//  * Возвращает MetricNode (Record<string, MetricNodeData>), где:
//  * - ключ: id узла (без префиксов)
//  * - значение: данные узла (children, metricData, sum, average)
//  *
//  * @param items - плоский массив IStatItem или FilteredStatItem
//  * @param metric - метрика для агрегации
//  */
// export function buildTreeWithAggregation(items: FilteredStatItem[], metric: Metrics): MetricNode {
//     const nodesMap = new Map<string, MetricNodeData>();
//     const daysCount = items[0]?.cost.length || 30;

//     // Временные структуры для накопления детей и данных
//     const childrenMap = new Map<string, Set<string>>();
//     const aggregationMap = new Map<
//         string,
//         {
//             metricData: (number | undefined)[];
//             count: number;
//         }
//     >();

//     // Инициализируем аггрегацию для узла
//     const initAggregation = (id: string) => {
//         if (!aggregationMap.has(id)) {
//             aggregationMap.set(id, {
//                 metricData: new Array(daysCount).fill(undefined),
//                 count: 0,
//             });
//         }
//         if (!childrenMap.has(id)) {
//             childrenMap.set(id, new Set());
//         }
//     };

//     // Первый проход: создаем все артикулы и накапливаем агрегацию
//     items.forEach((item) => {
//         item.article = item.article.trim();

//         const supplierId = createNodeId(item.supplier);
//         const brandId = createNodeId(item.supplier, item.brand);
//         const typeId = createNodeId(item.supplier, item.brand, item.type);
//         const articleId = createNodeId(item.supplier, item.brand, item.type, item.article);

//         // Инициализируем агрегации
//         initAggregation(supplierId);
//         initAggregation(brandId);
//         initAggregation(typeId);

//         // Получаем данные для метрики
//         const metricData = getMetricData(item, metric);
//         const sum = metricData.reduce((acc, val) => (acc ?? 0) + (val ?? 0), 0) ?? 0;

//         // Считаем количество дней с реальными данными (не undefined)
//         const validDaysCount = metricData.filter((val) => val !== undefined).length;

//         // Создаем узел артикула
//         const articleNode: MetricNode = {
//             id: articleId,
//             level: Levels.article,
//             children: [],
//             metricData,
//             sum,
//             average: validDaysCount > 0 ? sum / validDaysCount : 0,
//         };
//         nodesMap.set(articleId, articleNode);

//         // Добавляем в детей родителя
//         childrenMap.get(typeId)!.add(articleId);

//         // Агрегируем данные вверх по иерархии
//         [typeId, brandId, supplierId].forEach((parentId) => {
//             const agg = aggregationMap.get(parentId)!;
//             for (let i = 0; i < daysCount; i++) {
//                 const currentVal = metricData[i];
//                 if (currentVal !== undefined) {
//                     agg.metricData[i] = (agg.metricData[i] ?? 0) + currentVal;
//                 }
//             }
//             agg.count++;
//         });

//         // Регистрируем связи родитель-ребёнок
//         childrenMap.get(brandId)!.add(typeId);
//         childrenMap.get(supplierId)!.add(brandId);
//     });

//     // Второй проход: создаем узлы типов
//     childrenMap.forEach((children, nodeId) => {
//         if (nodeId.startsWith('type:')) {
//             const agg = aggregationMap.get(nodeId)!;
//             const sum = agg.metricData.reduce((acc, val) => (acc ?? 0) + (val ?? 0), 0) ?? 0;

//             // Считаем количество дней с реальными данными (не undefined)
//             const validDaysCount = agg.metricData.filter((val) => val !== undefined).length;

//             const typeNode: MetricNode = {
//                 id: nodeId,
//                 level: Levels.type,
//                 children: Array.from(children),
//                 metricData: agg.metricData,
//                 sum,
//                 average: validDaysCount > 0 ? sum / validDaysCount : 0,
//             };
//             nodesMap.set(nodeId, typeNode);
//         }
//     });

//     // Третий проход: создаем узлы брендов
//     childrenMap.forEach((children, nodeId) => {
//         if (nodeId.startsWith('brand:')) {
//             const agg = aggregationMap.get(nodeId)!;
//             const sum = agg.metricData.reduce((acc, val) => (acc ?? 0) + (val ?? 0), 0) ?? 0;

//             // Считаем количество дней с реальными данными (не undefined)
//             const validDaysCount = agg.metricData.filter((val) => val !== undefined).length;

//             const brandNode: MetricNode = {
//                 id: nodeId,
//                 level: Levels.brand,
//                 children: Array.from(children),
//                 metricData: agg.metricData,
//                 sum,
//                 average: validDaysCount > 0 ? sum / validDaysCount : 0,
//             };
//             nodesMap.set(nodeId, brandNode);
//         }
//     });

//     // Четвёртый проход: создаем узлы поставщиков
//     childrenMap.forEach((children, nodeId) => {
//         if (nodeId.startsWith('supplier:')) {
//             const agg = aggregationMap.get(nodeId)!;
//             const sum = agg.metricData.reduce((acc, val) => (acc ?? 0) + (val ?? 0), 0) ?? 0;

//             // Считаем количество дней с реальными данными (не undefined)
//             const validDaysCount = agg.metricData.filter((val) => val !== undefined).length;

//             const supplierNode: MetricNode = {
//                 id: nodeId,
//                 level: Levels.supplier,
//                 children: Array.from(children),
//                 metricData: agg.metricData,
//                 sum,
//                 average: validDaysCount > 0 ? sum / validDaysCount : 0,
//             };
//             nodesMap.set(nodeId, supplierNode);
//         }
//     });

//     return nodesMap;
// }

// /**
//  * Извлекает данные по дням для конкретной метрики из FilteredStatItem
//  * Сохраняет undefined для дней без данных
//  */
// export function getMetricData(item: FilteredStatItem, metric: string): (number | undefined)[] {
//     switch (metric) {
//         case Metrics.cost:
//             return item.cost;
//         case Metrics.orders:
//             return item.orders;
//         case Metrics.returns:
//             return item.returns;
//         case Metrics.buyouts:
//             return item.orders.map((order, idx) => {
//                 if (order === undefined || item.returns[idx] === undefined) return undefined;
//                 return order - item.returns[idx];
//             });
//         case Metrics.revenue:
//             return item.orders.map((order, idx) => {
//                 if (order === undefined || item.returns[idx] === undefined || item.cost[idx] === undefined) return undefined;
//                 const buyout = order - item.returns[idx];
//                 return item.cost[idx]! * buyout;
//             });
//         default:
//             return item.cost;
//     }
// }

// /**
//  * Главная функция обработки данных - объединяет все шаги
//  */
// export function processData(data: IStatItem[], metric: Metrics, requestId: number) {
//     console.time('filtering');
//     const filteredData = filterLast30Days(data);
//     console.timeEnd('filtering');
//     console.time('Aggregating');
//     const treeMap = buildTreeWithAggregation(filteredData, metric);
//     console.timeEnd('Aggregating');
//     console.time('From entries');
//     const treeObject = Object.fromEntries(treeMap);
//     console.timeEnd('From entries');

//     return {
//         treeData: treeObject,
//         requestId,
//     };
// }
