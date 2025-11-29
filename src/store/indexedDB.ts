import { openDB, IDBPDatabase } from 'idb';
import { Metrics } from '../types/metrics.types';
import { TreeNode } from '../types/tree.types';

// Интерфейс для хранимых данных
export interface MetricsDataRecord {
    treeData: Record<string, TreeNode>;
    timestamp: number;
}

// Схема базы данных
interface StatsDB {
    metricsData: {
        key: Metrics;
        value: MetricsDataRecord;
    };
}

const DB_NAME = 'statsDB';
const DB_VERSION = 1;
const STORE_NAME = 'metricsData';

/**
 * Инициализирует и возвращает экземпляр базы данных
 */
export async function initDB(): Promise<IDBPDatabase<StatsDB>> {
    return openDB<StatsDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
                console.log('Object store "metricsData" создан');
            }
        },
        blocked() {
            console.warn('База данных заблокирована. Закройте другие вкладки для обновления.');
        },
        blocking() {
            console.warn('Эта вкладка блокирует обновление БД.');
        },
        terminated() {
            console.warn('Соединение с БД прервано.');
        },
    });
}

/**
 * Сохраняет данные для метрики в IndexedDB
 */
export async function saveMetricData(
    db: IDBPDatabase<StatsDB>,
    metric: Metrics,
    treeData: Record<string, TreeNode>,
    timestamp: number,
): Promise<void> {
    const record: MetricsDataRecord = {
        treeData,
        timestamp,
    };

    console.time('saveToDB');
    await db.put(STORE_NAME, record, metric);
    console.timeEnd('saveToDB');
    console.log(`Данные для метрики "${metric}" сохранены в IndexedDB`);
}

/**
 * Получает данные для метрики из IndexedDB
 */
export async function getMetricData(db: IDBPDatabase<StatsDB>, metric: Metrics): Promise<MetricsDataRecord | null> {
    console.time('getFromDB');
    const record = await db.get(STORE_NAME, metric);
    console.timeEnd('getFromDB');

    if (record) {
        console.log(`Данные для метрики "${metric}" получены из IndexedDB`);
        return record;
    }

    console.log(`Данных для метрики "${metric}" в IndexedDB нет`);
    return null;
}
