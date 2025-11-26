// Программа для вычисления revenue

const costData = Array(30)
    .fill(0)
    .map((_, i) => 150.5 + i * 0.25); // Цены варьируются от 150.50 до 157.75

const ordersData = Array(30)
    .fill(0)
    .map((_, i) => 20 + (i % 10)); // Заказы варьируются от 20 до 29

const returnsData = Array(30)
    .fill(0)
    .map((_, i) => 5 + (i % 8)); // Возвраты варьируются от 5 до 12

console.log('=== Вычисление Revenue ===\n');

// Вычисляем revenue для каждого дня
const revenueData = [];
let totalRevenue = 0;

for (let i = 0; i < 30; i++) {
    const cost = costData[i];
    const orders = ordersData[i];
    const returns = returnsData[i];
    const buyouts = orders - returns;
    const revenue = cost * buyouts;

    revenueData.push(revenue);
    totalRevenue += revenue;

    console.log(
        `День ${i}: cost=${cost.toFixed(2)}, orders=${orders}, returns=${returns}, ` + `buyouts=${buyouts}, revenue=${revenue.toFixed(2)}`,
    );
}

console.log('\n=== Итоговые результаты ===');
console.log(`Сумма revenue за все 30 дней: ${totalRevenue}`);
console.log(`Среднее значение revenue: ${totalRevenue / 30}`);
