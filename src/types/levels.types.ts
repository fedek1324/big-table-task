export enum Levels {
    type = 'type',
    article = 'article',
    brand = 'brand',
    supplier = 'supplier',
}

export const ORDERED_LEVELS = [Levels.supplier, Levels.brand, Levels.type, Levels.article] as const;

export const METADATA_LABELS = {
    [Levels.supplier]: 'Supplier',
    [Levels.brand]: 'Brand',
    [Levels.type]: 'Type',
    [Levels.article]: 'Article',
} as const satisfies Record<Levels, string>;
