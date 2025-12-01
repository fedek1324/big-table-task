import { openDB, IDBPDatabase } from 'idb';
import { Metrics } from '../types/metrics.types';
import { MetricDataMap } from '../types/metric.types';

// Схема базы данных
interface StatsDB {
    metricsData: {
        key: Metrics;
        value: MetricDataMap;
    };
    metricsTimestamps: {
        key: Metrics;
        value: number;
    };
}

const DB_NAME = 'statsDB';
const DB_VERSION = 2;
const STORE_NAME = 'metricsData';
const TIMESTAMPS_STORE_NAME = 'metricsTimestamps';

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
            if (!db.objectStoreNames.contains(TIMESTAMPS_STORE_NAME)) {
                db.createObjectStore(TIMESTAMPS_STORE_NAME);
                console.log('Object store "metricsTimestamps" создан');
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
    treeData: MetricDataMap,
    timestamp: number,
): Promise<void> {
    await db.put(STORE_NAME, treeData, metric);
    await db.put(TIMESTAMPS_STORE_NAME, timestamp, metric);
}

/**
 * Получает данные для метрики из IndexedDB
 */
export async function getMetricData(db: IDBPDatabase<StatsDB>, metric: Metrics): Promise<MetricDataMap | null> {
    const record = await db.get(STORE_NAME, metric);

    if (record) {
        return record;
    }

    return null;
}

/**
 * Получает timestamp для метрики из IndexedDB
 */
export async function getMetricTimestamp(db: IDBPDatabase<StatsDB>, metric: Metrics): Promise<number | null> {
    const timestamp = await db.get(TIMESTAMPS_STORE_NAME, metric);
    return timestamp || null;
}
