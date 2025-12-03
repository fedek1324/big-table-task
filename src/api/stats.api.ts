import { IStatItem } from '../types/stats.types';

class StatsApi {
    private getRequestId() {
        return Math.random().toString(36).substring(2, 15);
    }
    private worker: Worker;
    private resolvedMessages = new Map<string, IStatItem[]>();
    constructor() {
        this.worker = new Worker(new URL('./mock.ts', import.meta.url));
        this.worker.onmessage = (event) => {
            switch (event.data.action) {
                case 'getStatsData':
                    this.resolvedMessages.set(event.data.requestId, event.data.result);
                    break;
            }
        };
    }
    private sendMessageToWorker(messageData: { action: string; size?: number; requestId: string }) {
        this.worker.postMessage(messageData);
    }
    private request(messageData: { action: string; size?: number }) {
        const requestId = this.getRequestId();
        return new Promise<IStatItem[]>((resolve, _reject) => {
            this.sendMessageToWorker({ ...messageData, requestId });

            setInterval(() => {
                if (this.resolvedMessages.has(requestId)) {
                    resolve(this.resolvedMessages.get(requestId)!);
                    this.resolvedMessages.delete(requestId);
                }
            }, 1000);
        });
    }

    //выше воркер притворяется сервером, не обращай внимания

    public getShort(): Promise<IStatItem[]> {
        return this.request({ action: 'getStatsData', size: 1000 });
    }

    public getFull(): Promise<IStatItem[]> {
        return this.request({ action: 'getStatsData' });
    }

    public getVersion(): Promise<number> {
        return new Promise((resolve) => {
            resolve(1);
        });
    }
}

export const STATS_API = new StatsApi();
