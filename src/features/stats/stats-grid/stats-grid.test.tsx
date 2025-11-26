import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processData } from '../helpers/dataHandleHelpers';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StatsGrid } from './stats-grid';
import { STATS_API } from '../../../api/stats.api';
import type { IStatItem } from '../../../types/stats.types';

// Мокаем API
vi.mock('../../../api/stats.api', () => ({
    STATS_API: {
        getFull: vi.fn(),
    },
}));

// Функция-помощник для создания мок-данных
interface MockDataParams {
    supplier?: string;
    brand?: string;
    type?: string;
    article?: string;
    lastUpdate?: string;
    cost?: number[];
    orders?: number[];
    returns?: number[];
}

const createMockData = ({
    supplier = 'Test Supplier',
    brand = 'Test Brand',
    type = 'Test Type',
    article = 'TEST-001',
    lastUpdate = new Date().toISOString(),
    cost = Array(30).fill(100),
    orders = Array(30).fill(10),
    returns = Array(30).fill(2),
}: MockDataParams = {}): IStatItem => ({
    supplier,
    brand,
    type,
    article,
    lastUpdate,
    cost,
    orders,
    returns,
});

const formatNumber = (numberStr: string): number => {
    // Remove spaces (thousand separators) and replace comma with dot (decimal separator)
    return Number(numberStr.replace(/\s/g, '').replace(',', '.'));
};

const compareDigitsCount = 3;

describe('StatsGrid', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Stub global Worker
        class MockWorker {
            onmessage: ((ev: MessageEvent) => void) | null = null;
            onerror: ((ev: ErrorEvent) => void) | null = null;

            constructor(_script?: string, _options?: any) {}

            postMessage(msg: any) {
                const { data, metric, requestId } = msg;
                try {
                    const result = processData(data, metric, requestId);
                    // Emulate async behaviour of web worker
                    setTimeout(() => {
                        if (this.onmessage) this.onmessage({ data: result } as MessageEvent);
                    }, 0);
                } catch (error) {
                    if (this.onerror) this.onerror({ error } as ErrorEvent);
                }
            }

            terminate() {}
        }

        vi.stubGlobal('Worker', MockWorker as typeof Worker);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should render table with Test supplier', async () => {
        // Подготавливаем мок-данные для этого теста
        const testData = [
            createMockData({
                supplier: 'Test Supplier', // Explicitly setting supplier name
                article: 'TEST-001',
                cost: Array(30).fill(100),
                orders: Array(30).fill(10),
                returns: Array(30).fill(2),
            }),
        ];
        (STATS_API.getFull as any).mockResolvedValue(testData);

        const { container } = render(
            <MemoryRouter initialEntries={['/stats?metric=cost']}>
                <StatsGrid />
            </MemoryRouter>,
        );

        await waitFor(
            () => {
                const grid = container.querySelector('.ag-root-wrapper');
                expect(grid).toBeInTheDocument();
            },
            { timeout: 5000 },
        );

        await waitFor(
            () => {
                const grid = container.querySelector('.ag-root-wrapper');
                expect(grid?.textContent).toContain('Test Supplier');
            },
            { timeout: 5000 },
        );
    });

    it('should correctly display average cost data', async () => {
        // Подготавливаем мок-данные для этого теста
        const testData = [
            createMockData({
                article: 'TEST-001',
                cost: Array(30).fill(100),
                orders: Array(30).fill(10),
                returns: Array(30).fill(2),
            }),
        ];

        const averageCost = 100;

        (STATS_API.getFull as any).mockResolvedValue(testData);

        const { container } = render(
            <MemoryRouter initialEntries={['/stats?metric=cost']}>
                <StatsGrid />
            </MemoryRouter>,
        );

        // Проверяем что worker правильно агрегировал данные
        // Sum для cost должна быть (100 * 30 + 200 * 30) = 9000 для поставщика
        await waitFor(() => {
            const sumCells = container.querySelectorAll('[col-id="average"]');
            expect(formatNumber(sumCells[1].textContent)).toBeCloseTo(averageCost, compareDigitsCount);
        });
    });

    it('should correctly display float average', async () => {
        // Подготавливаем мок-данные для этого теста
        const testData = [
            createMockData({
                article: 'TEST-001',
                cost: [...Array(28).fill(0), 86320, 69013],
                orders: Array(30).fill(10),
                returns: Array(30).fill(2),
            }),
        ];

        const averageCost = (86320 + 69013) / 30;

        (STATS_API.getFull as any).mockResolvedValue(testData);

        const { container } = render(
            <MemoryRouter initialEntries={['/stats?metric=cost']}>
                <StatsGrid />
            </MemoryRouter>,
        );

        // Проверяем что worker правильно агрегировал данные
        // Sum для cost должна быть (100 * 30 + 200 * 30) = 9000 для поставщика
        await waitFor(() => {
            const sumCells = container.querySelectorAll('[col-id="average"]');
            expect(formatNumber(sumCells[1].textContent)).toBeCloseTo(averageCost, compareDigitsCount);
        });
    });

    it('should correctly calculate revenue sum and average', async () => {
        // Подготавливаем комплексный тест кейс с множественными товарами и разными стоимостями
        // revenue = cost * buyouts = cost * (orders - returns)
        const costData = Array(30)
            .fill(0)
            .map((_, i) => 150.5 + i * 0.25); // Цены варьируются от 150.50 до 157.75
        const ordersData = Array(30)
            .fill(0)
            .map((_, i) => 20 + (i % 10)); // Заказы варьируются от 20 до 29
        const returnsData = Array(30)
            .fill(0)
            .map((_, i) => 5 + (i % 8)); // Возвраты варьируются от 5 до 12

        // Ожидаемое значение revenue:
        // revenue[i] = cost[i] * (orders[i] - returns[i]) for each day
        // Пример: day 0: 150.50 * (20-5) = 150.50 * 15 = 2257.50
        //         day 1: 150.75 * (21-6) = 150.75 * 15 = 2261.25
        //         ...
        // sum(revenue) для всех 30 дней = 74948.75
        // average(revenue) 2498.2916666666665
        const sum = 74948.75;
        const average = 2498.2916666666665;

        const testData = [
            createMockData({
                supplier: 'Premium Supplier',
                brand: 'Premium Brand',
                article: 'PREM-001',
                cost: costData,
                orders: ordersData,
                returns: returnsData,
            }),
        ];
        (STATS_API.getFull as any).mockResolvedValue(testData);

        const { container } = render(
            <MemoryRouter initialEntries={['/stats?metric=revenue']}>
                <StatsGrid />
            </MemoryRouter>,
        );

        // Проверяем что таблица отрендерилась с правильными данными
        await waitFor(
            () => {
                const grid = container.querySelector('.ag-root-wrapper');
                expect(grid?.textContent).toContain('Premium Supplier');
            },
            { timeout: 5000 },
        );

        // // Проверяем что сумма revenue вычислена правильно
        await waitFor(
            () => {
                const sumCells = container.querySelectorAll('[col-id="sums"]');
                expect(sumCells.length).toBeGreaterThan(0);
                // sum(revenue) = sum of cost[i] * (orders[i] - returns[i]) for all 30 days = 74948.75
                expect(formatNumber(sumCells[1].textContent || '0')).toBeCloseTo(sum, compareDigitsCount);

                const averageCells = container.querySelectorAll('[col-id="average"]');
                expect(averageCells.length).toBeGreaterThan(0);
                // sum(revenue) = sum of cost[i] * (orders[i] - returns[i]) for all 30 days = 74948.75
                expect(formatNumber(averageCells[1].textContent || '0')).toBeCloseTo(average, compareDigitsCount);
            },
            { timeout: 5000 },
        );
    });

    it('should correctly handle data with old lastUpdate date', async () => {
        // Тестируем данные с lastUpdate = 5 дней назад
        // Данные приходят включая сегодняшний день. Всего получаем 30 данных.
        // Это значит что cost[0] = 5 дней назад, cost[1] = 6 дней назад и т.д.

        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

        const testData = [
            createMockData({
                supplier: 'Old Data Supplier',
                brand: 'Old Brand',
                article: 'OLD-001',
                lastUpdate: fiveDaysAgo.toISOString(),
                cost: Array(30).fill(100), // Все цены = 100
                orders: Array(30).fill(10), // Все заказы = 10
                returns: Array(30).fill(2), // Все возвраты = 2
            }),
        ];

        // После фильтрации:
        // - первые 5 дней, включая сегодня, будут без данных (0-4 дня назад от сегодня)
        // - следующие 25 дней будут иметь значения (5-29 дней назад)
        // cost[i] для i=5..29 будет 100
        // orders[i] для i=5..29 будет 10
        // returns[i] для i=5..29 будет 2
        // revenue для дней с данными: 100 * (10 - 2) = 800
        // Количество дней с данными: 25
        // sum = 800 * 25 = 20000
        // average = 20000 / 30 = 666.667
        const expectedSum = 20000;
        const expectedAverage = 666.667;

        (STATS_API.getFull as any).mockResolvedValue(testData);

        const { container } = render(
            <MemoryRouter initialEntries={['/stats?metric=revenue']}>
                <StatsGrid />
            </MemoryRouter>,
        );

        await waitFor(
            () => {
                const grid = container.querySelector('.ag-root-wrapper');
                expect(grid?.textContent).toContain('Old Data Supplier');
            },
            { timeout: 5000 },
        );

        await waitFor(
            () => {
                const sumCells = container.querySelectorAll('[col-id="sums"]');
                expect(sumCells.length).toBeGreaterThan(0);
                expect(formatNumber(sumCells[1].textContent || '0')).toBeCloseTo(expectedSum, compareDigitsCount);

                const averageCells = container.querySelectorAll('[col-id="average"]');
                expect(averageCells.length).toBeGreaterThan(0);
                expect(formatNumber(averageCells[1].textContent || '0')).toBeCloseTo(expectedAverage, compareDigitsCount);
            },
            { timeout: 5000 },
        );
    });
});
