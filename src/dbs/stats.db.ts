import Dixie, { Table } from 'dexie';
import { IStatItem } from '../types/stats.types';
import { Levels } from '../types/levels.types';

export class AdStatsDatabase extends Dixie {
    [Levels.supplier]!: Table<IStatItem>;
    [Levels.article]!: Table<IStatItem>;
    [Levels.brand]!: Table<IStatItem>;
    [Levels.type]!: Table<IStatItem>;

    constructor(user_uuid: string) {
        super(user_uuid);

        this.version(1).stores({
            [Levels.article]: '++article',
            [Levels.brand]: '++brand',
            [Levels.type]: '++type',
            [Levels.supplier]: '++supplier',
        });
    }
}
