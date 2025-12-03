import { Levels, ORDERED_LEVELS } from './levels.types';

export type TableNodeId = string;

// Данные узла дерева (без id)
export interface TableNodeData {
    // Массив ID дочерних узлов
    childIds: TableNodeId[];

    // Данные по дням для выбранной метрики (агрегированные с детей)
    // Может содержать undefined для дней без данных
    metricData: (number | undefined)[];

    // Агрегированные данные для выбранной метрики
    sum: number | undefined;
    average: number | undefined;
}

type FirstLevel = (typeof ORDERED_LEVELS)[0];
type OtherLevels = Exclude<(typeof ORDERED_LEVELS)[number], FirstLevel>;

export type TableNodeObjectId = {
    [K in FirstLevel]: string;
} & {
    [K in OtherLevels]?: string;
};

// Создает ID узла по его компонентам
export function createNodeId<T extends TableNodeObjectId>(idObject: T, level: number = ORDERED_LEVELS.length - 1): TableNodeId {
    return ORDERED_LEVELS.slice(0, level + 1)
        .map((key) => idObject[key])
        .filter((value): value is string => value !== undefined)
        .join(':');
}

// Получает уровень узла из id по количеству двоеточий
// 0 двоеточий = supplier, 1 = brand, 2 = type, 3 = article
export function getLevel(id: TableNodeId): Levels {
    const colonCount = (id.match(/:/g) || []).length;
    return ORDERED_LEVELS[colonCount];
}

// Извлекает название элемента из nodeId на указанном уровне
// Например: getNameFromNodeId('supplier1:brand2:type3', Levels.brand) => 'brand2'
export function getNameFromNodeId(id: TableNodeId, level?: Levels): string {
    const targetLevel = level ?? getLevel(id);
    const levelIndex = ORDERED_LEVELS.indexOf(targetLevel);

    if (levelIndex === -1) {
        return '';
    }

    const parts = id.split(':');
    return parts[levelIndex] || '';
}

export type TableDataMap = Record<TableNodeId, TableNodeData>;
