import { IStatItem } from '../../../types/stats.types';
import { Levels } from '../../../types/levels.types';
import { TreeNode, SupplierNode, BrandNode, GoodTypeNode, ArticleNode, createNodeId } from '../../../types/tree.types';
import { Metrics } from '../../../types/metrics.types';

// Тип для данных без lastUpdate после фильтрации
// Массивы могут содержать undefined для дней, где нет данных
export type FilteredStatItem = {
    type: string;
    article: string;
    brand: string;
    supplier: string;
    cost: (number | undefined)[];
    orders: (number | undefined)[];
    returns: (number | undefined)[];
    revenue?: (number | undefined)[];
    buyouts?: (number | undefined)[];
    sums?: IStatItem['sums'];
    average?: IStatItem['average'];
};

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
export function filterLast30Days(items: IStatItem[]): FilteredStatItem[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Устанавливаем на начало дня

    return items.map((item) => {
        const lastUpdateDate = new Date(item.lastUpdate);
        lastUpdateDate.setHours(0, 0, 0, 0);

        // Вычисляем сколько дней прошло с lastUpdate до сегодня
        const daysDiff = Math.floor((today.getTime() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24));

        // Определяем сколько элементов нужно взять из массивов
        // cost[0] = lastUpdate (это daysDiff дней назад от сегодня)
        // Хотим взять данные за последние 30 дней включительно
        const elementsToTake = Math.max(0, 30 - daysDiff);

        // Сколько элементов undefined нужно добавить в начало
        const undefinedCount = daysDiff;

        // Создаём функцию для формирования массива с undefined в начале
        const padArray = (arr: number[] | undefined, count: number): (number | undefined)[] => {
            if (!arr) return new Array(30).fill(undefined);
            const sliced = arr.slice(0, count);
            const padding = new Array(Math.min(undefinedCount, 30)).fill(undefined);
            return [...padding, ...sliced].slice(0, 30);
        };

        // Обрезаем массивы данных
        const { lastUpdate, ...itemWithoutLastUpdate } = item;

        return {
            ...itemWithoutLastUpdate,
            cost: padArray(item.cost, elementsToTake) as number[],
            orders: padArray(item.orders, elementsToTake) as number[],
            returns: padArray(item.returns, elementsToTake) as number[],
            revenue: padArray(item.revenue, elementsToTake) as number[],
            buyouts: padArray(item.buyouts, elementsToTake) as number[],
        };
    });
}

/**
 * Строит иерархическое дерево из плоского массива IStatItem
 *
 * Возвращает Map<nodeId, TreeNode>, где каждый узел содержит:
 * - id: уникальный идентификатор
 * - level: уровень в иерархии (0-3)
 * - children: массив ID дочерних узлов
 * - metricData: значения метрики по дням
 * - sum и average: агрегированные значения
 *
 * @param items - плоский массив IStatItem или FilteredStatItem
 * @param metric - метрика для агрегации
 */
export function buildTreeWithAggregation(items: FilteredStatItem[], metric: Metrics): Map<string, TreeNode> {
    const nodesMap = new Map<string, TreeNode>();
    const daysCount = items[0]?.cost.length || 30;

    // Временные структуры для накопления детей и данных
    const childrenMap = new Map<string, Set<string>>();
    const aggregationMap = new Map<
        string,
        {
            metricData: (number | undefined)[];
            count: number;
        }
    >();

    // Инициализируем аггрегацию для узла
    const initAggregation = (id: string) => {
        if (!aggregationMap.has(id)) {
            aggregationMap.set(id, {
                metricData: new Array(daysCount).fill(undefined),
                count: 0,
            });
        }
        if (!childrenMap.has(id)) {
            childrenMap.set(id, new Set());
        }
    };

    // Первый проход: создаем все артикулы и накапливаем агрегацию
    items.forEach((item) => {
        item.article = item.article.trim();

        const supplierId = createNodeId(item.supplier);
        const brandId = createNodeId(item.supplier, item.brand);
        const typeId = createNodeId(item.supplier, item.brand, item.type);
        const articleId = createNodeId(item.supplier, item.brand, item.type, item.article);

        // Инициализируем агрегации
        initAggregation(supplierId);
        initAggregation(brandId);
        initAggregation(typeId);

        // Получаем данные для метрики
        const metricData = getMetricData(item, metric);
        const sum = metricData.reduce((acc, val) => (acc ?? 0) + (val ?? 0), 0) ?? 0;

        // Считаем количество дней с реальными данными (не undefined)
        const validDaysCount = metricData.filter((val) => val !== undefined).length;

        // Создаем узел артикула
        const articleNode: ArticleNode = {
            id: articleId,
            level: Levels.article,
            metric,
            children: [],
            supplier: item.supplier,
            brand: item.brand,
            type: item.type,
            article: item.article,
            metricData,
            sum,
            average: validDaysCount > 0 ? sum / validDaysCount : 0,
        };
        nodesMap.set(articleId, articleNode);

        // Добавляем в детей родителя
        childrenMap.get(typeId)!.add(articleId);

        // Агрегируем данные вверх по иерархии
        [typeId, brandId, supplierId].forEach((parentId) => {
            const agg = aggregationMap.get(parentId)!;
            for (let i = 0; i < daysCount; i++) {
                const currentVal = metricData[i];
                if (currentVal !== undefined) {
                    agg.metricData[i] = (agg.metricData[i] ?? 0) + currentVal;
                }
            }
            agg.count++;
        });

        // Регистрируем связи родитель-ребёнок
        childrenMap.get(brandId)!.add(typeId);
        childrenMap.get(supplierId)!.add(brandId);
    });

    // Второй проход: создаем узлы типов
    childrenMap.forEach((children, nodeId) => {
        if (nodeId.startsWith('type:')) {
            const parts = nodeId.split(':');
            const supplier = parts[1];
            const brand = parts[2];
            const type = parts[3];

            const agg = aggregationMap.get(nodeId)!;
            const sum = agg.metricData.reduce((acc, val) => (acc ?? 0) + (val ?? 0), 0) ?? 0;

            // Считаем количество дней с реальными данными (не undefined)
            const validDaysCount = agg.metricData.filter((val) => val !== undefined).length;

            const typeNode: GoodTypeNode = {
                id: nodeId,
                level: Levels.type,
                metric,
                children: Array.from(children),
                supplier,
                brand,
                type,
                metricData: agg.metricData,
                sum,
                average: validDaysCount > 0 ? sum / validDaysCount : 0,
            };
            nodesMap.set(nodeId, typeNode);
        }
    });

    // Третий проход: создаем узлы брендов
    childrenMap.forEach((children, nodeId) => {
        if (nodeId.startsWith('brand:')) {
            const parts = nodeId.split(':');
            const supplier = parts[1];
            const brand = parts[2];

            const agg = aggregationMap.get(nodeId)!;
            const sum = agg.metricData.reduce((acc, val) => (acc ?? 0) + (val ?? 0), 0) ?? 0;

            // Считаем количество дней с реальными данными (не undefined)
            const validDaysCount = agg.metricData.filter((val) => val !== undefined).length;

            const brandNode: BrandNode = {
                id: nodeId,
                level: Levels.brand,
                metric,
                children: Array.from(children),
                supplier,
                brand,
                metricData: agg.metricData,
                sum,
                average: validDaysCount > 0 ? sum / validDaysCount : 0,
            };
            nodesMap.set(nodeId, brandNode);
        }
    });

    // Четвёртый проход: создаем узлы поставщиков
    childrenMap.forEach((children, nodeId) => {
        if (nodeId.startsWith('supplier:')) {
            const supplier = nodeId.split(':')[1];

            const agg = aggregationMap.get(nodeId)!;
            const sum = agg.metricData.reduce((acc, val) => (acc ?? 0) + (val ?? 0), 0) ?? 0;

            // Считаем количество дней с реальными данными (не undefined)
            const validDaysCount = agg.metricData.filter((val) => val !== undefined).length;

            const supplierNode: SupplierNode = {
                id: nodeId,
                level: Levels.supplier,
                metric,
                children: Array.from(children),
                supplier,
                metricData: agg.metricData,
                sum,
                average: validDaysCount > 0 ? sum / validDaysCount : 0,
            };
            nodesMap.set(nodeId, supplierNode);
        }
    });

    return nodesMap;
}

/**
 * Извлекает данные по дням для конкретной метрики из FilteredStatItem
 * Сохраняет undefined для дней без данных
 */
export function getMetricData(item: FilteredStatItem, metric: string): (number | undefined)[] {
    switch (metric) {
        case Metrics.cost:
            return item.cost;
        case Metrics.orders:
            return item.orders;
        case Metrics.returns:
            return item.returns;
        case Metrics.buyouts:
            return item.orders.map((order, idx) => {
                if (order === undefined || item.returns[idx] === undefined) return undefined;
                return order - item.returns[idx];
            });
        case Metrics.revenue:
            return item.orders.map((order, idx) => {
                if (order === undefined || item.returns[idx] === undefined || item.cost[idx] === undefined) return undefined;
                const buyout = order - item.returns[idx];
                return item.cost[idx]! * buyout;
            });
        default:
            return item.cost;
    }
}

/**
 * Главная функция обработки данных - объединяет все шаги
 */
export function processData(data: IStatItem[], metric: Metrics, requestId: number) {
    const filteredData = filterLast30Days(data);
    const treeMap = buildTreeWithAggregation(filteredData, metric);
    const treeObject = Object.fromEntries(treeMap);

    return {
        treeData: treeObject,
        requestId,
    };
}
