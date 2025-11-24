// Базовый интерфейс для всех узлов дерева
export interface TreeNodeBase {
    // Уникальный ID узла
    id: string;

    // Уровень в иерархии (0 = supplier, 1 = brand, 2 = type, 3 = article)
    level: number;

    // Массив ID дочерних узлов
    children: string[];

    // Данные по дням для выбранной метрики (агрегированные с детей)
    metricData: number[];

    // Агрегированные данные для выбранной метрики
    sum: number;
    average: number;
}

// Узел поставщика (верхний уровень, level = 0)
export interface SupplierNode extends TreeNodeBase {
    level: 0;
    supplier: string;
}

// Узел бренда (второй уровень, level = 1)
export interface BrandNode extends TreeNodeBase {
    level: 1;
    supplier: string;
    brand: string;
}

// Узел типа товара (третий уровень, level = 2)
export interface GoodTypeNode extends TreeNodeBase {
    level: 2;
    supplier: string;
    brand: string;
    type: string;
}

// Узел артикула (листовой узел, четвёртый уровень, level = 3)
export interface ArticleNode extends TreeNodeBase {
    level: 3;
    children: []; // Всегда пустой массив для листовых узлов
    supplier: string;
    brand: string;
    type: string;
    article: string;
}

// Union тип для всех узлов дерева
export type TreeNode = SupplierNode | BrandNode | GoodTypeNode | ArticleNode;

// Структура дерева: Map<nodeId, TreeNode>
export type TreeDataMap = Map<string, TreeNode>;

// Helper функция для создания ID узла
export function createNodeId(supplier: string, brand?: string, type?: string, article?: string): string {
    if (article) {
        return `article:${supplier}:${brand}:${type}:${article}`;
    }
    if (type) {
        return `type:${supplier}:${brand}:${type}`;
    }
    if (brand) {
        return `brand:${supplier}:${brand}`;
    }
    return `supplier:${supplier}`;
}
