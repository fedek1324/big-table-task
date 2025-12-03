import { Levels, ORDERED_LEVELS } from './levels.types';

type TableNodeId = string;

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

export type TableDataMap = Record<TableNodeId, TableNodeData>;
