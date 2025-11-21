import { AgGridReact } from 'ag-grid-react';
import { useEffect, useState } from 'react';
import { IStatItem } from '../../../types/stats.types';
import { STATS_API } from '../../../api/stats.api';
import { ColDef, themeBalham } from 'ag-grid-enterprise';
import { useSearchParams } from 'react-router-dom';
import { Metrics } from '../stats.const';
import { statsGridColumnsFactory } from './stats-grid.columns';
import './stats-grid.scss';

export function StatsGrid() {
    const [rowData, setRowData] = useState<IStatItem[] | null>(null);
    const [columnDefs, setColumnDefs] = useState<ColDef<IStatItem>[]>([]);
    const [searchParams] = useSearchParams();
    const metric = searchParams.get('metric') ?? Metrics.cost;

    useEffect(() => {
        const dates = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
        setColumnDefs(statsGridColumnsFactory(metric, dates));
    }, [metric]);

    useEffect(() => {
        STATS_API.getFull().then((data) => {
            console.log('getFull Data ', data);

            let calculatedCount = 0;
            data.forEach((item, index) => {
                // Разбиваем вычисление на маленькие операции чтобы избежать out of memory
                setTimeout(() => {
                    // Перед артиклем почему то идут пробелы с бэка
                    item.article = item.article.trim();

                    // Рассчитываем buyouts (выкупы) = orders - returns
                    item.buyouts = item.orders.map((dayOrderCount, index) => dayOrderCount - item.returns[index]);

                    // Рассчитываем revenue (выручка) = cost * buyouts
                    item.revenue = item.cost.map((dayCost, index) => dayCost * item.buyouts![index]);

                    // Рассчитываем суммы
                    const sumCost = item.cost.reduce((acc, val) => acc + val, 0);
                    const sumOrders = item.orders.reduce((acc, val) => acc + val, 0);
                    const sumReturns = item.returns.reduce((acc, val) => acc + val, 0);
                    const sumRevenue = item.revenue.reduce((acc, val) => acc + val, 0);
                    const sumBuyouts = item.buyouts.reduce((acc, val) => acc + val, 0);

                    item.sums = {
                        cost: sumCost,
                        orders: sumOrders,
                        returns: sumReturns,
                        revenue: sumRevenue,
                        buyouts: sumBuyouts,
                    };

                    // Рассчитываем средние значения
                    const daysCount = item.cost.length;
                    item.average = {
                        cost: sumCost / daysCount,
                        orders: sumOrders / daysCount,
                        returns: sumReturns / daysCount,
                        revenue: sumRevenue / daysCount,
                        buyouts: sumBuyouts / daysCount,
                    };
                    console.log(`Item ${index + 1} is calculated`);
                    calculatedCount++;
                    if (calculatedCount === data.length) {
                        console.log(`Calculations finished!`);
                        setRowData(data);
                    }
                });
            });
        });
    }, []);

    return (
        <div className='stats-grid ag-theme-balham'>
            <AgGridReact
                groupHideParentOfSingleChild='leafGroupsOnly'
                autoGroupColumnDef={{
                    menuTabs: ['columnsMenuTab'],
                    pinned: 'left',
                    field: 'article', // явно указываем что отображаем артикли
                }}
                theme={themeBalham.withParams({
                    backgroundColor: 'var(--bs-body-bg)',
                    foregroundColor: 'var(--bs-body-color)',
                    browserColorScheme: 'light',
                })}
                rowData={rowData}
                columnDefs={columnDefs}
            ></AgGridReact>
        </div>
    );
}
