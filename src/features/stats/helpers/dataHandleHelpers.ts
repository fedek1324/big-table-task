import { IStatItem } from '@/types/stats.types';
import { TableDataMap, TableNodeData, createNodeId } from '@/types/tableNode.types';
import { Metrics } from '@/types/metrics.types';

// Расширенный тип для поддержки неаддитивных метрик (cost)
// Для cost нужно хранить количество ячеек по дням для вычисления средних
interface ExtendedMetricNodeData extends TableNodeData {
    // Количество непустых ячеек по каждому дню (для вычисления средних в неаддитивных метриках)
    cellCounts?: (number | undefined)[];
}

type ExtendedMetricDataMap = Record<string, ExtendedMetricNodeData>;

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

// Для неаддитивных метрик (cost) пробегаясь по товарам в сумму ничего
// записывать не будем, среднее будем считать как раньше, но
// вверх в группу будем передавать и сумму и количество ячеек
// потом когда будем проходить в цикле по группам для агрегации
// уже будем считать средние по датам поделив сумму на число ячеек для даты
// общее среднее будем считать как сумму всех сумм по датам делённую на число всех ячеек
// для вышестоящих групп будем передавать суммы по датам и количества ячеек по датам в
// категориях и вычислять среднее как сумма всех сумм подгрупп по датам делённая
// на сумму всех сумм ячеек по датам подгрупп

// Создаём функцию для формирования массива с undefined в начале
const padArray = (arr: number[], elementsToTake: number): (number | undefined)[] => {
    return Array(30 - elementsToTake)
        .fill(undefined)
        .concat(arr.slice(0, elementsToTake));
};

/**
 * Главная функция обработки данных - объединяет все шаги
 */
export function processData(data: IStatItem[], metric: Metrics): { treeData: TableDataMap } {
    // TODO мы в метрике сохраняем список товаров брендов и тд
    // а можно хранить только данные
    const allMetricData: ExtendedMetricDataMap = {};
    const levelIds: Array<Array<string>> = [];

    // Флаг для неаддитивных метрик (cost)
    const isNonAdditive = metric === Metrics.cost;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Устанавливаем на начало дня

    for (let i = 0; i < data.length; i++) {
        const good = data[i];
        const { supplier, brand, type, article, lastUpdate } = good;

        // Создаём id узла
        const newGoodId = createNodeId({ supplier, brand, type, article });

        // 1) Получаем новый массив с данными метрики за последние 30 дней включая сегодня
        const lastUpdateDate = new Date(lastUpdate);
        lastUpdateDate.setHours(0, 0, 0, 0);
        // Вычисляем сколько дней прошло с lastUpdate до сегодня
        const daysDiff = Math.floor((today.getTime() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24));
        // Определяем сколько элементов нужно взять из массивов
        // cost[0] = lastUpdate (это daysDiff дней назад от сегодня)
        // Хотим взять данные за последние 30 дней включительно
        const elementsToTake = Math.max(0, 30 - daysDiff);

        let metricData: TableNodeData['metricData'];
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
            metric satisfies never;
            console.log(`Unknown metric: ${metric}`);
            metricData = [];
        }

        // Вычисляем сумму и среднее по всей метрике
        const metricSum = elementsToTake > 0 ? metricData.reduce<number>((acc, val) => acc + (val ?? 0), 0) : undefined;
        const metricAverage = elementsToTake > 0 && metricSum !== undefined ? metricSum / elementsToTake : undefined;

        // 2) Мы должны получить плоскую структуру объектов с id и childIds[]
        const idSplit = newGoodId.split(':');
        let totalLevelId = '';
        for (let i = 0; i < idSplit.length; i++) {
            totalLevelId += (i > 0 ? ':' : '') + idSplit[i];

            const isNewNode = allMetricData[totalLevelId] === undefined;

            if (isNewNode) {
                // Создаём объект уровня
                const newNodeId = totalLevelId;
                const nodeData: ExtendedMetricNodeData = {
                    childIds: [],
                    metricData: new Array(30).fill(undefined),
                    sum: undefined,
                    average: undefined,
                };

                // Для неаддитивных метрик (cost) добавляем массив для подсчета количества ячеек
                if (isNonAdditive) {
                    nodeData.cellCounts = new Array(30).fill(undefined);
                }

                allMetricData[newNodeId] = nodeData;

                if (i === idSplit.length - 1) {
                    // товар
                    nodeData.metricData = metricData;

                    if (isNonAdditive) {
                        // Для неаддитивных метрик (cost): sum не имеет смысла
                        nodeData.sum = undefined;
                        nodeData.average = metricAverage;
                        nodeData.cellCounts = metricData.map((val) => (val !== undefined ? 1 : undefined));
                    } else {
                        // Для аддитивных метрик
                        nodeData.sum = metricSum;
                        nodeData.average = metricAverage;
                    }
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

        if (isNonAdditive) {
            // Для неаддитивных метрик (cost): суммируем значения и количество ячеек
            parent.metricData = metricData.map((dayNumber, i) => {
                if (dayNumber === undefined) {
                    return parent.metricData[i];
                } else {
                    return (parent.metricData[i] ?? 0) + dayNumber;
                }
            });

            // Суммируем количество ячеек по дням
            parent.cellCounts = metricData.map((dayNumber, i) => {
                if (dayNumber === undefined) {
                    return parent.cellCounts![i];
                } else {
                    return (parent.cellCounts![i] ?? 0) + 1;
                }
            });
        } else {
            // Для аддитивных метрик: просто суммируем
            parent.metricData = metricData.map((dayNumber, i) => {
                if (dayNumber === undefined) {
                    return parent.metricData[i];
                } else {
                    return (parent.metricData[i] ?? 0) + dayNumber;
                }
            });
        }

        // Освобождаем память: удаляем обработанный элемент
        // @ts-ignore - явно устанавливаем undefined для сборщика мусора
        data[i] = undefined;
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

                if (isNonAdditive) {
                    // Для неаддитивных метрик (cost): вычисляем средние по датам и общее среднее
                    let totalSum = 0;
                    let totalCellCount = 0;

                    for (let k = 0; k < smallGroup.metricData.length; k++) {
                        const daySum = smallGroup.metricData[k];
                        const dayCellCount = smallGroup.cellCounts![k];

                        if (daySum !== undefined && dayCellCount !== undefined && dayCellCount > 0) {
                            // Вычисляем среднее для дня
                            smallGroup.metricData[k] = daySum / dayCellCount;
                            // Агрегируем для общего среднего
                            totalSum += daySum;
                            totalCellCount += dayCellCount;
                        }
                    }

                    smallGroup.sum = undefined; // Для неаддитивных метрик sum не имеет смысла
                    smallGroup.average = totalCellCount > 0 ? totalSum / totalCellCount : undefined;
                } else {
                    // Для аддитивных метрик: считаем как раньше
                    let filledDaysCount = 0;
                    let sum = 0;
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
            }
        } else {
            // Проходим по группам и агрегируем данные от детей
            for (let j = 0; j < groupIds.length; j++) {
                const groupId = groupIds[j];
                const group = allMetricData[groupId];
                const childIds = group.childIds;

                // Инициализируем массив для агрегации
                group.metricData = new Array(30).fill(undefined);

                if (isNonAdditive) {
                    // Для неаддитивных метрик: агрегируем суммы и количества ячеек от детей
                    group.cellCounts = new Array(30).fill(undefined);

                    for (let k = 0; k < childIds.length; k++) {
                        const childId = childIds[k];
                        const child = allMetricData[childId];

                        for (let day = 0; day < 30; day++) {
                            const childValue = child.metricData[day];
                            const childCellCount = child.cellCounts![day];

                            if (childValue !== undefined && childCellCount !== undefined) {
                                // Суммируем взвешенные значения (среднее * количество)
                                group.metricData[day] = (group.metricData[day] ?? 0) + childValue * childCellCount;
                                group.cellCounts[day] = (group.cellCounts[day] ?? 0) + childCellCount;
                            }
                        }
                    }

                    // Вычисляем средние по дням и общее среднее
                    let totalSum = 0;
                    let totalCellCount = 0;
                    for (let day = 0; day < 30; day++) {
                        const daySum = group.metricData[day];
                        const dayCellCount = group.cellCounts[day];

                        if (daySum !== undefined && dayCellCount !== undefined && dayCellCount > 0) {
                            // Среднее для дня
                            group.metricData[day] = daySum / dayCellCount;
                            // Агрегируем для общего среднего
                            totalSum += daySum;
                            totalCellCount += dayCellCount;
                        }
                    }

                    group.sum = undefined; // Для неаддитивных метрик sum не имеет смысла
                    group.average = totalCellCount > 0 ? totalSum / totalCellCount : undefined;
                } else {
                    // Для аддитивных метрик: агрегируем данные от всех детей по дням
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
    }

    // Очищаем служебное поле cellCounts перед возвратом (если оно есть)
    if (isNonAdditive) {
        for (const nodeId in allMetricData) {
            delete allMetricData[nodeId].cellCounts;
        }
    }

    return { treeData: allMetricData as TableDataMap };
}
