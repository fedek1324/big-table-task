import { IStatItem } from '../../../types/stats.types';
import { TreeNode, SupplierNode, BrandNode, GoodTypeNode, ArticleNode, createNodeId } from '../../../types/tree.types';
import { Metrics } from '../stats.const';

console.log('buildTreeWorker imported');

onmessage = function (e) {
    const { data, metric, requestId } = e.data;

    console.log('BuildTreeWorker: Starting tree building for metric:', metric, 'requestId:', requestId);
    const treeMap = buildTreeWithAggregation(data as IStatItem[], metric);
    console.log('BuildTreeWorker: Tree built, total nodes:', treeMap.size, 'requestId:', requestId);

    // Преобразуем Map в объект для передачи через postMessage
    const treeObject = Object.fromEntries(treeMap);

    postMessage({
        treeData: treeObject,
        requestId,
    });
};

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
 * @param items - плоский массив IStatItem с бэкенда
 * @param metric - метрика для агрегации
 */
function buildTreeWithAggregation(items: IStatItem[], metric: string): Map<string, TreeNode> {
    const nodesMap = new Map<string, TreeNode>();
    const daysCount = items[0]?.cost.length || 30;

    // Временные структуры для накопления детей и данных
    const childrenMap = new Map<string, Set<string>>();
    const aggregationMap = new Map<
        string,
        {
            metricData: number[];
            count: number;
        }
    >();

    // Инициализируем аггрегацию для узла
    const initAggregation = (id: string) => {
        if (!aggregationMap.has(id)) {
            aggregationMap.set(id, {
                metricData: new Array(daysCount).fill(0),
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
        const sum = metricData.reduce((acc, val) => acc + val, 0);

        // Создаем узел артикула
        const articleNode: ArticleNode = {
            id: articleId,
            level: 3,
            children: [],
            supplier: item.supplier,
            brand: item.brand,
            type: item.type,
            article: item.article,
            metricData,
            sum,
            average: sum / daysCount,
        };
        nodesMap.set(articleId, articleNode);

        // Добавляем в детей родителя
        childrenMap.get(typeId)!.add(articleId);

        // Агрегируем данные вверх по иерархии
        [typeId, brandId, supplierId].forEach((parentId) => {
            const agg = aggregationMap.get(parentId)!;
            for (let i = 0; i < daysCount; i++) {
                agg.metricData[i] += metricData[i];
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
            const sum = agg.metricData.reduce((acc, val) => acc + val, 0);

            const typeNode: GoodTypeNode = {
                id: nodeId,
                level: 2,
                children: Array.from(children),
                supplier,
                brand,
                type,
                metricData: agg.metricData,
                sum,
                average: sum / daysCount,
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
            const sum = agg.metricData.reduce((acc, val) => acc + val, 0);

            const brandNode: BrandNode = {
                id: nodeId,
                level: 1,
                children: Array.from(children),
                supplier,
                brand,
                metricData: agg.metricData,
                sum,
                average: sum / daysCount,
            };
            nodesMap.set(nodeId, brandNode);
        }
    });

    // Четвёртый проход: создаем узлы поставщиков
    childrenMap.forEach((children, nodeId) => {
        if (nodeId.startsWith('supplier:')) {
            const supplier = nodeId.split(':')[1];

            const agg = aggregationMap.get(nodeId)!;
            const sum = agg.metricData.reduce((acc, val) => acc + val, 0);

            const supplierNode: SupplierNode = {
                id: nodeId,
                level: 0,
                children: Array.from(children),
                supplier,
                metricData: agg.metricData,
                sum,
                average: sum / daysCount,
            };
            nodesMap.set(nodeId, supplierNode);
        }
    });

    return nodesMap;
}

/**
 * Извлекает данные по дням для конкретной метрики из IStatItem
 */
function getMetricData(item: IStatItem, metric: string): number[] {
    switch (metric) {
        case Metrics.cost:
            return item.cost;
        case Metrics.orders:
            return item.orders;
        case Metrics.returns:
            return item.returns;
        case Metrics.buyouts:
            return item.orders.map((order, idx) => order - item.returns[idx]);
        case Metrics.revenue:
            const buyouts = item.orders.map((order, idx) => order - item.returns[idx]);
            return item.cost.map((cost, idx) => cost * buyouts[idx]);
        default:
            return item.cost;
    }
}
