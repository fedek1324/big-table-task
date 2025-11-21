import { IStatItem } from '../types/stats.types';

const BRANDS = ['Nike', 'Adidas', 'ARMADABOOTS', 'Ecco', 'Asolo', 'Lomer'];

const TYPES = ['Кеды', 'Кроссовки', 'Ботинки'];

const SUPPLIERS = ['ООО Обувной барыга', 'ООО Пупа и Лупа', 'ЗАО Госбюджетраспил'];

function getRandomIndexFromArray<T>(array: T[]) {
    return Math.floor(Math.random() * array.length);
}

class ApiWorker {
    constructor() {
        self.addEventListener('message', this.handleMessage.bind(this));
    }

    private async handleMessage(event: MessageEvent<{ action: string; size?: number; requestId: string }>) {
        const { action, size, requestId } = event.data;

        try {
            switch (action) {
                case 'getStatsData':
                    const result = await this.genStatsData(size);
                    self.postMessage({ requestId, result, action });
                    console.log('getStatsData', requestId);
                    break;
                default:
                    throw new Error(`Unknown action: ${action}`);
            }
        } catch (error) {
            throw error;
        }
    }

    private genStatsData(size: number = 1e5) {
        const pow = Math.log10(size);
        const items: IStatItem[] = [];

        for (let i = 0; i < size; i++) {
            const brand = BRANDS[getRandomIndexFromArray(BRANDS)];
            const type = TYPES[getRandomIndexFromArray(TYPES)];
            const supplier = SUPPLIERS[getRandomIndexFromArray(SUPPLIERS)];
            const cost: number[] = [];
            const orders: number[] = [];
            const returns: number[] = [];

            for (let day = 0; day < 30; day++) {
                const dayCost = Math.round(Math.random() * 95000) + 5000;
                const dayOrders = Math.round(Math.random() * 100);
                cost.push(dayCost);
                orders.push(dayOrders);
                returns.push(Math.round(Math.random() * dayOrders * 0.5));
            }

            const lastUpdateShift = Math.round(Math.random() * 30) * 24 * 60 * 60 * 1000;
            const lastUpdate = new Date(Date.now() - lastUpdateShift).toISOString();

            items.push({
                article: `${i}`.padStart(pow),
                type,
                brand,
                supplier,
                cost,
                orders,
                returns,
                lastUpdate,
            });
        }

        return items;
    }
}

new ApiWorker();
