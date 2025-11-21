import { IStatItem } from '../../../types/stats.types';
import { Metrics } from '../stats.const';

console.log('worker imported');

onmessage = function (e) {
    const { data, aggregateType, requestId } = e.data;

    console.log('Worker: Starting aggregation for metric:', aggregateType, 'requestId:', requestId);
    const workerResult = aggregateData(data, aggregateType);
    console.log('Worker: Posting message to main thread, requestId:', requestId);
    postMessage({ data: workerResult, requestId });
};

// self.addEventListener('message', function (e: MessageEvent) {
//     const { type, data, metric } = e.data;
//     console.log(`worker got message ${e}`);

//     if (type === 'aggregate') {
//         console.log('Worker: Starting aggregation for metric:', metric);
//         const aggregatedData = aggregateData(data, metric);
//         console.log('Worker: Aggregation completed');

//         // Отправляем обработанные данные обратно в основной поток
//         self.postMessage({ type: 'aggregated', data: aggregatedData });
//     }
// });

function aggregateData(rowData: IStatItem[], metric: string): IStatItem[] {
    // Данные из основного потока не мутируются поэтому можем использовать forEach
    rowData.forEach((item, index) => {
        // Перед артиклем почему то идут пробелы с бэка
        item.article = item.article.trim();

        const daysCount = item.cost.length;

        // Инициализируем объекты для сумм и средних
        item.sums = {
            cost: 0,
            orders: 0,
            returns: 0,
            revenue: 0,
            buyouts: 0,
        };

        item.average = {
            cost: 0,
            orders: 0,
            returns: 0,
            revenue: 0,
            buyouts: 0,
        };

        // Вычисляем только для выбранной метрики
        if (metric === Metrics.cost) {
            const sumCost = item.cost.reduce((acc, val) => acc + val, 0);
            item.sums.cost = sumCost;
            item.average.cost = sumCost / daysCount;
        } else if (metric === Metrics.orders) {
            const sumOrders = item.orders.reduce((acc, val) => acc + val, 0);
            item.sums.orders = sumOrders;
            item.average.orders = sumOrders / daysCount;
        } else if (metric === Metrics.returns) {
            const sumReturns = item.returns.reduce((acc, val) => acc + val, 0);
            item.sums.returns = sumReturns;
            item.average.returns = sumReturns / daysCount;
        } else if (metric === Metrics.buyouts) {
            item.buyouts = item.orders.map((dayOrderCount, index) => dayOrderCount - item.returns[index]);
            const sumBuyouts = item.buyouts.reduce((acc, val) => acc + val, 0);
            item.sums.buyouts = sumBuyouts;
            item.average.buyouts = sumBuyouts / daysCount;
        } else if (metric === Metrics.revenue) {
            // Для revenue нужны buyouts
            item.buyouts = item.orders.map((dayOrderCount, index) => dayOrderCount - item.returns[index]);
            item.revenue = item.cost.map((dayCost, index) => dayCost * item.buyouts![index]);
            const sumRevenue = item.revenue.reduce((acc, val) => acc + val, 0);
            item.sums.revenue = sumRevenue;
            item.average.revenue = sumRevenue / daysCount;
        }

        if ((index + 1) % 10000 === 0) {
            console.log(`Worker: ${(index + 1) / 1000}k items calculated`);
        }
    });
    return rowData;
}
