import { vi } from 'vitest';
import { processData } from '../features/stats/helpers/dataHandleHelpers';

// Мокаем Worker глобально перед загрузкой любых модулей
class MockWorker {
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: ErrorEvent) => void) | null = null;

    constructor(_script?: string, _options?: any) {}

    postMessage(msg: any) {
        const { data, metric, requestId } = msg;
        try {
            const result = processData(data, metric, requestId);
            // Эмулируем асинхронное поведение web worker
            setTimeout(() => {
                if (this.onmessage) this.onmessage({ data: result } as MessageEvent);
            }, 0);
        } catch (error) {
            if (this.onerror) this.onerror({ error } as ErrorEvent);
        }
    }

    terminate() {}
}

// Устанавливаем глобальный мок Worker
vi.stubGlobal('Worker', MockWorker as typeof Worker);
