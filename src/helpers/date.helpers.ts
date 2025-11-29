/**
 * Проверяет, что две даты относятся к одному дню
 * Сравнение происходит в UTC без учета часового пояса
 */
export function isSameDay(timestamp1: number, timestamp2: number): boolean {
    const date1 = new Date(timestamp1).toISOString().split('T')[0];
    const date2 = new Date(timestamp2).toISOString().split('T')[0];
    return date1 === date2;
}
