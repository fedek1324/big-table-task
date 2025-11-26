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
            expect(formatNumber(sumCells[1].textContent)).toBe(100);
        });
    });

    it('should display average as toFixed(3)', async () => {
        // Подготавливаем мок-данные для этого теста
        const testData = [
            createMockData({
                article: 'TEST-001',
                cost: [...Array(28).fill(0), 86320, 69013],
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

        // Проверяем что worker правильно агрегировал данные
        // Sum для cost должна быть (100 * 30 + 200 * 30) = 9000 для поставщика
        await waitFor(() => {
            const sumCells = container.querySelectorAll('[col-id="average"]');
            expect(formatNumber(sumCells[1].textContent)).toBe(5177.767);
        });
    });

    it('should correctly calculate revenue: revenue = cost * buyouts where buyouts = orders - returns', async () => {
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

        // Проверяем что сумма revenue вычислена правильно
        await waitFor(
            () => {
                const sumCells = container.querySelectorAll('[col-id="sums"]');
                expect(sumCells.length).toBeGreaterThan(0);
                // sum(revenue) = sum of cost[i] * (orders[i] - returns[i]) for all 30 days = 74948.75
                expect(formatNumber(sumCells[0].textContent || '0')).toBeCloseTo(74948.75, 0);
            },
            { timeout: 10000 },
        );
    }, 10000);
});
