import { Levels, ORDERED_LEVELS } from './levels.types';

// Данные узла дерева (без id)
export interface MetricNodeData {
    // Массив ID дочерних узлов
    childIds: string[];

    // Данные по дням для выбранной метрики (агрегированные с детей)
    // Может содержать undefined для дней без данных
    metricData: (number | undefined)[];

    // Агрегированные данные для выбранной метрики
    sum: number | undefined;
    average: number | undefined;
}

// Создает ID узла по его компонентам
export function createNodeId(supplier: string, brand?: string, type?: string, article?: string): string {
    if (article) {
        return `${supplier}:${brand}:${type}:${article}`;
    }
    if (type) {
        return `${supplier}:${brand}:${type}`;
    }
    if (brand) {
        return `${supplier}:${brand}`;
    }
    return supplier;
}

// Получает уровень узла из id по количеству двоеточий
// 0 двоеточий = supplier, 1 = brand, 2 = type, 3 = article
export function getLevel(id: string): Levels {
    const colonCount = (id.match(/:/g) || []).length;
    return ORDERED_LEVELS[colonCount];
}

export type MetricDataMap = Record<string, MetricNodeData>;
