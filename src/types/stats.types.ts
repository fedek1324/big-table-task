export enum Levels {
    type = 'type',
    article = 'article',
    brand = 'brand',
    supplier = 'supplier',
}

export const ORDERED_LEVELS = [Levels.supplier, Levels.brand, Levels.type, Levels.article] as const;

// данные с бэкенда
interface IStatItemRaw {
    type: string; // тип
    article: string; // артикул
    brand: string; // бренд
    supplier: string; // поставщик
    cost: number[]; // цена в этот день за штуку
    orders: number[]; // заказы за день
    returns: number[]; // возвраты за день
    lastUpdate: string; // дата последнего обновления
}

// расширенная модель данных для отображения в гриде
export interface IStatItem extends IStatItemRaw {
    revenue?: number[]; // расход за день; считается как cost *
    buyouts?: number[]; // выкупы за день; считается как orders - returns

    sums?: {
        cost: number;
        orders: number;
        returns: number;
        revenue: number;
        buyouts: number;
    };
    average?: {
        cost: number;
        orders: number;
        returns: number;
        revenue: number;
        buyouts: number;
    };
}
