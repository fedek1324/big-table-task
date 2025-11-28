import { Levels } from './stats.types';

// Базовый интерфейс для всех узлов дерева
export interface TreeNodeBase {
    // Уникальный ID узла
    id: string;

    // Уровень в иерархии
    level: Levels;

    // Массив ID дочерних узлов
    children: string[];

    // Данные по дням для выбранной метрики (агрегированные с детей)
    // Может содержать undefined для дней без данных
    metricData: (number | undefined)[];

    // Агрегированные данные для выбранной метрики
    sum: number;
    average: number;
}

// Узел поставщика (верхний уровень)
export interface SupplierNode extends TreeNodeBase {
    level: Levels.supplier;
    supplier: string;
}

// Узел бренда (второй уровень)
export interface BrandNode extends TreeNodeBase {
    level: Levels.brand;
    supplier: string;
    brand: string;
}

// Узел типа товара (третий уровень)
export interface GoodTypeNode extends TreeNodeBase {
    level: Levels.type;
    supplier: string;
    brand: string;
    type: string;
}

// Узел артикула (листовой узел, четвёртый уровень)
export interface ArticleNode extends TreeNodeBase {
    level: Levels.article;
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
