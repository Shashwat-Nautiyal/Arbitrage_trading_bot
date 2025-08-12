// Global state and configuration
let dashboardData = {
    opportunities: [
        {
            id: 1,
            timestamp: 1703097600000,
            dex_a: "Uniswap",
            dex_b: "Sushiswap",
            pair: "WETH/USDC",
            direction: "BuyUni_SellSushi",
            buy_price: 2245.50,
            sell_price: 2248.75,
            estimated_profit: 2.85,
            price_difference_pct: 0.14,
            status: "detected"
        },
        {
            id: 2,
            timestamp: 1703097300000,
            dex_a: "Sushiswap",
            dex_b: "Quickswap",
            pair: "WETH/USDC",
            direction: "BuySushi_SellQuick",
            buy_price: 2246.20,
            sell_price: 2244.80,
            estimated_profit: -3.20,
            price_difference_pct: -0.06,
            status: "detected"
        },
        {
            id: 3,
            timestamp: 1703097000000,
            dex_a: "Quickswap",
            dex_b: "Uniswap",
            pair: "WETH/USDC",
            direction: "BuyQuick_SellUni",
            buy_price: 2243.90,
            sell_price: 2247.15,
            estimated_profit: 1.25,
            price_difference_pct: 0.14,
            status: "detected"
        },
        {
            id: 4,
            timestamp: 1703096700000,
            dex_a: "Uniswap",
            dex_b: "Quickswap",
            pair: "WETH/USDC",
            direction: "BuyUni_SellQuick",
            buy_price: 2245.10,
            sell_price: 2249.80,
            estimated_profit: 2.70,
            price_difference_pct: 0.21,
            status: "detected"
        },
        {
            id: 5,
            timestamp: 1703096400000,
            dex_a: "Sushiswap",
            dex_b: "Uniswap",
            pair: "WETH/USDC",
            direction: "BuySushi_SellUni",
            buy_price: 2247.50,
            sell_price: 2245.20,
            estimated_profit: -4.30,
            price_difference_pct: -0.10,
            status: "detected"
        }
    ],
    exchanges: {
        "Uniswap": {
            name: "Uniswap V2",
            status: "online",
            last_price: 2245.50,
            liquidity: 15420000,
            volume_24h: 8950000
        },
        "Sushiswap": {
            name: "Sushiswap",
            status: "online",
            last_price: 2246.20,
            liquidity: 8750000,
            volume_24h: 4200000
        },
        "Quickswap": {
            name: "Quickswap",
            status: "online",
            last_price: 2243.90,
            liquidity: 5200000,
            volume_24h: 2100000
        }
    },
    performance: {
        total_opportunities_24h: 156,
        profitable_opportunities_24h: 23,
        success_rate: 14.7,
        total_potential_profit_24h: 47.85,
        best_opportunity_24h: 5.40,
        avg_profit: 2.08
    }
};

let settings = {
    refreshInterval: 5,
    profitThreshold: 0,
    autoRefresh: true,
    soundAlerts: true,
    theme: 'auto'
};

let charts = {};
let refreshTimer = null;
let sortState = { column: 'timestamp', direction: 'desc' };

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
});

function initializeDashboard() {
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    updateSummaryCards();
    updateExchangeStatus();
    renderOpportunitiesTable();
    initializeCharts();
    setupEventListeners();
    
    if (settings.autoRefresh) {
        startAutoRefresh();
    }
    
    showNotification('Dashboard initialized successfully', 'success');
}

function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    document.getElementById('currentTime').textContent = timeString;
    document.getElementById('lastUpdate').textContent = now.toLocaleTimeString();
}

function updateSummaryCards() {
    const perf = dashboardData.performance;
    
    document.getElementById('totalOpportunities').textContent = perf.total_opportunities_24h;
    document.getElementById('profitableOpportunities').textContent = perf.profitable_opportunities_24h;
    document.getElementById('successRate').textContent = perf.success_rate.toFixed(1) + '%';
    
    document.getElementById('cardTotalOpportunities').textContent = perf.total_opportunities_24h;
    document.getElementById('cardProfitableOpportunities').textContent = perf.profitable_opportunities_24h;
    document.getElementById('cardTotalProfit').textContent = '$' + perf.total_potential_profit_24h.toFixed(2);
    document.getElementById('cardBestOpportunity').textContent = '$' + perf.best_opportunity_24h.toFixed(2);
}

function updateExchangeStatus() {
    const exchangeList = document.getElementById('exchangeList');
    exchangeList.innerHTML = '';
    
    Object.entries(dashboardData.exchanges).forEach(([key, exchange]) => {
        const exchangeItem = document.createElement('div');
        exchangeItem.className = 'exchange-item';
        exchangeItem.innerHTML = `
            <div class="exchange-info">
                <span class="status-indicator ${exchange.status}"></span>
                <div>
                    <div class="exchange-name">${exchange.name}</div>
                </div>
            </div>
            <div class="exchange-details">
                <div class="exchange-price">$${exchange.last_price.toFixed(2)}</div>
                <div class="exchange-liquidity">Liquidity: $${formatNumber(exchange.liquidity)}</div>
            </div>
        `;
        exchangeList.appendChild(exchangeItem);
    });
}

function renderOpportunitiesTable(filteredData = null) {
    const tableBody = document.getElementById('tableBody');
    const data = filteredData || dashboardData.opportunities;
    
    // Sort data based on current sort state
    const sortedData = sortOpportunities(data, sortState.column, sortState.direction);
    
    tableBody.innerHTML = '';
    
    sortedData.forEach(opportunity => {
        const row = document.createElement('tr');
        row.className = opportunity.estimated_profit > settings.profitThreshold ? 'profitable' : 'unprofitable';
        
        const timestamp = new Date(opportunity.timestamp).toLocaleTimeString();
        const route = `${opportunity.dex_a} → ${opportunity.dex_b}`;
        const profitClass = opportunity.estimated_profit >= 0 ? 'profit-positive' : 'profit-negative';
        const spreadClass = opportunity.price_difference_pct >= 0 ? 'spread-positive' : 'spread-negative';
        
        row.innerHTML = `
            <td>${timestamp}</td>
            <td>${route}</td>
            <td>${opportunity.pair}</td>
            <td>$${opportunity.buy_price.toFixed(2)}</td>
            <td>$${opportunity.sell_price.toFixed(2)}</td>
            <td class="${spreadClass}">${opportunity.price_difference_pct.toFixed(2)}%</td>
            <td class="${profitClass}">$${opportunity.estimated_profit.toFixed(2)}</td>
            <td><span class="status-badge ${opportunity.status}">${opportunity.status}</span></td>
        `;
        
        tableBody.appendChild(row);
        
        // Trigger sound alert for profitable opportunities
        if (opportunity.estimated_profit > settings.profitThreshold && settings.soundAlerts) {
            playNotificationSound();
        }
    });
}

function sortOpportunities(data, column, direction) {
    return [...data].sort((a, b) => {
        let aVal, bVal;
        
        switch (column) {
            case 'timestamp':
                aVal = a.timestamp;
                bVal = b.timestamp;
                break;
            case 'route':
                aVal = `${a.dex_a} → ${a.dex_b}`;
                bVal = `${b.dex_a} → ${b.dex_b}`;
                break;
            case 'pair':
                aVal = a.pair;
                bVal = b.pair;
                break;
            case 'buyPrice':
                aVal = a.buy_price;
                bVal = b.buy_price;
                break;
            case 'sellPrice':
                aVal = a.sell_price;
                bVal = b.sell_price;
                break;
            case 'spread':
                aVal = a.price_difference_pct;
                bVal = b.price_difference_pct;
                break;
            case 'profit':
                aVal = a.estimated_profit;
                bVal = b.estimated_profit;
                break;
            default:
                return 0;
        }
        
        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }
        
        if (direction === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
}

function initializeCharts() {
    // Price comparison chart
    const priceCtx = document.getElementById('priceChart').getContext('2d');
    const priceData = generatePriceChartData();
    
    charts.priceChart = new Chart(priceCtx, {
        type: 'line',
        data: priceData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(119, 124, 124, 0.1)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(119, 124, 124, 0.1)'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                }
            }
        }
    });
    
    // Profit distribution chart
    const profitCtx = document.getElementById('profitChart').getContext('2d');
    const profitData = generateProfitChartData();
    
    charts.profitChart = new Chart(profitCtx, {
        type: 'bar',
        data: profitData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(119, 124, 124, 0.1)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(119, 124, 124, 0.1)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function generatePriceChartData() {
    const labels = [];
    const uniswapData = [];
    const sushiswapData = [];
    const quickswapData = [];
    
    // Generate last 12 hours of data
    for (let i = 11; i >= 0; i--) {
        const time = new Date(Date.now() - i * 60 * 60 * 1000);
        labels.push(time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        
        // Simulate price variations
        uniswapData.push(2245.50 + (Math.random() - 0.5) * 10);
        sushiswapData.push(2246.20 + (Math.random() - 0.5) * 10);
        quickswapData.push(2243.90 + (Math.random() - 0.5) * 10);
    }
    
    return {
        labels: labels,
        datasets: [{
            label: 'Uniswap',
            data: uniswapData,
            borderColor: '#1FB8CD',
            backgroundColor: 'rgba(31, 184, 205, 0.1)',
            tension: 0.1
        }, {
            label: 'Sushiswap',
            data: sushiswapData,
            borderColor: '#FFC185',
            backgroundColor: 'rgba(255, 193, 133, 0.1)',
            tension: 0.1
        }, {
            label: 'Quickswap',
            data: quickswapData,
            borderColor: '#B4413C',
            backgroundColor: 'rgba(180, 65, 60, 0.1)',
            tension: 0.1
        }]
    };
}

function generateProfitChartData() {
    const profitRanges = ['< -$5', '-$5 to 0', '$0 to $2', '$2 to $5', '> $5'];
    const counts = [8, 125, 15, 6, 2]; // Sample data
    
    return {
        labels: profitRanges,
        datasets: [{
            data: counts,
            backgroundColor: ['#DB4545', '#D2BA4C', '#5D878F', '#1FB8CD', '#964325']
        }]
    };
}

function setupEventListeners() {
    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    
    // Search functionality
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    
    // Export functionality
    document.getElementById('exportBtn').addEventListener('click', exportToCSV);
    
    // Table sorting
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => handleSort(header.dataset.sort));
    });
    
    // Settings
    document.getElementById('settingsToggle').addEventListener('click', toggleSettings);
    document.getElementById('refreshInterval').addEventListener('change', updateRefreshInterval);
    document.getElementById('profitThreshold').addEventListener('input', updateProfitThreshold);
    document.getElementById('autoRefresh').addEventListener('change', toggleAutoRefresh);
    document.getElementById('soundAlerts').addEventListener('change', toggleSoundAlerts);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-color-scheme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-color-scheme', newTheme);
    
    const themeIcon = document.querySelector('.theme-icon');
    themeIcon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    
    settings.theme = newTheme;
}

function handleSearch() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    if (!searchTerm) {
        renderOpportunitiesTable();
        return;
    }
    
    const filteredData = dashboardData.opportunities.filter(opportunity => {
        return opportunity.pair.toLowerCase().includes(searchTerm) ||
               opportunity.dex_a.toLowerCase().includes(searchTerm) ||
               opportunity.dex_b.toLowerCase().includes(searchTerm) ||
               opportunity.status.toLowerCase().includes(searchTerm);
    });
    
    renderOpportunitiesTable(filteredData);
}

function handleSort(column) {
    if (sortState.column === column) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.column = column;
        sortState.direction = 'desc';
    }
    
    renderOpportunitiesTable();
    
    // Update sort indicators
    document.querySelectorAll('.sortable').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
    });
    
    const currentHeader = document.querySelector(`[data-sort="${column}"]`);
    currentHeader.classList.add(`sort-${sortState.direction}`);
}

function exportToCSV() {
    const headers = ['Timestamp', 'DEX A', 'DEX B', 'Pair', 'Buy Price', 'Sell Price', 'Spread %', 'Est. Profit', 'Status'];
    
    const csvContent = [
        headers.join(','),
        ...dashboardData.opportunities.map(opp => [
            new Date(opp.timestamp).toLocaleString(),
            opp.dex_a,
            opp.dex_b,
            opp.pair,
            opp.buy_price.toFixed(2),
            opp.sell_price.toFixed(2),
            opp.price_difference_pct.toFixed(2),
            opp.estimated_profit.toFixed(2),
            opp.status
        ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arbitrage-opportunities-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification('CSV exported successfully', 'success');
}

function toggleSettings() {
    const content = document.getElementById('settingsContent');
    const toggle = document.getElementById('settingsToggle');
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        toggle.textContent = '−';
    } else {
        content.classList.add('collapsed');
        toggle.textContent = '+';
    }
}

function updateRefreshInterval() {
    settings.refreshInterval = parseInt(document.getElementById('refreshInterval').value);
    
    if (settings.autoRefresh) {
        stopAutoRefresh();
        startAutoRefresh();
    }
}

function updateProfitThreshold() {
    settings.profitThreshold = parseFloat(document.getElementById('profitThreshold').value);
    renderOpportunitiesTable();
}

function toggleAutoRefresh() {
    settings.autoRefresh = document.getElementById('autoRefresh').checked;
    
    if (settings.autoRefresh) {
        startAutoRefresh();
    } else {
        stopAutoRefresh();
    }
}

function toggleSoundAlerts() {
    settings.soundAlerts = document.getElementById('soundAlerts').checked;
}

function startAutoRefresh() {
    refreshTimer = setInterval(simulateDataUpdate, settings.refreshInterval * 1000);
}

function stopAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

function simulateDataUpdate() {
    // Simulate new opportunities
    const newOpportunity = {
        id: dashboardData.opportunities.length + 1,
        timestamp: Date.now(),
        dex_a: getRandomExchange(),
        dex_b: getRandomExchange(),
        pair: "WETH/USDC",
        direction: "Simulated",
        buy_price: 2240 + Math.random() * 20,
        sell_price: 2240 + Math.random() * 20,
        estimated_profit: (Math.random() - 0.5) * 10,
        price_difference_pct: (Math.random() - 0.5) * 2,
        status: "detected"
    };
    
    // Ensure different exchanges
    while (newOpportunity.dex_a === newOpportunity.dex_b) {
        newOpportunity.dex_b = getRandomExchange();
    }
    
    // Add new opportunity to the beginning
    dashboardData.opportunities.unshift(newOpportunity);
    
    // Keep only latest 50 opportunities
    if (dashboardData.opportunities.length > 50) {
        dashboardData.opportunities = dashboardData.opportunities.slice(0, 50);
    }
    
    // Update performance metrics
    dashboardData.performance.total_opportunities_24h++;
    if (newOpportunity.estimated_profit > settings.profitThreshold) {
        dashboardData.performance.profitable_opportunities_24h++;
    }
    
    // Update exchange prices slightly
    Object.keys(dashboardData.exchanges).forEach(exchange => {
        dashboardData.exchanges[exchange].last_price += (Math.random() - 0.5) * 2;
    });
    
    // Update UI
    updateSummaryCards();
    updateExchangeStatus();
    renderOpportunitiesTable();
    
    // Add animation to updated rows
    const firstRow = document.querySelector('#tableBody tr:first-child');
    if (firstRow) {
        firstRow.classList.add('data-update');
        setTimeout(() => firstRow.classList.remove('data-update'), 500);
    }
}

function getRandomExchange() {
    const exchanges = ['Uniswap', 'Sushiswap', 'Quickswap'];
    return exchanges[Math.floor(Math.random() * exchanges.length)];
}

function playNotificationSound() {
    // Create a simple beep sound using Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.2);
}

function showNotification(message, type = 'success') {
    // Remove existing notification
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toFixed(0);
}

// Handle page visibility changes
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        stopAutoRefresh();
    } else if (settings.autoRefresh) {
        startAutoRefresh();
    }
});

// Handle window resize for charts
window.addEventListener('resize', function() {
    Object.values(charts).forEach(chart => {
        if (chart) chart.resize();
    });
});