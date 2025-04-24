const express = require('express');
const proxy = require('express-http-proxy'); // Baseline 和 Service B 都会用
const Redis = require('ioredis');          // 保留引入，即使暂时不用
const axios = require('axios');            // 保留引入，即使暂时不用

const app = express();
const PORT = 8080;

// --- Redis 配置 (保留，但 Baseline 场景下不主动使用) ---
const redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
});
redisClient.on('error', (err) => console.error('[Redis Error]', err)); // 添加错误监听

// --- 服务地址配置 ---
const SERVICE_A_INSTANCES = [
    { id: 'A1', url: process.env.SERVICE_A1_URL || 'http://localhost:8081' },
    { id: 'A2', url: process.env.SERVICE_A2_URL || 'http://localhost:8082' }
];
const SERVICE_B_URL = process.env.SERVICE_B_URL || 'http://localhost:8083';
const SERVICE_C_URL = process.env.SERVICE_C_URL || 'http://localhost:8084';

// --- 动态路由状态 (Baseline 不需要，注释掉) ---
/*
const instanceStats = {};
SERVICE_A_INSTANCES.forEach(instance => {
    instanceStats[instance.id] = { responseTime: undefined, lastRequestTime: 0 };
});
const EXPLORATION_PROBABILITY = 0.1;
*/

// --- Baseline: 轮询状态 ---
let baselineRoundRobinCounter = 0;


// --- 日志中间件 ---
app.use((req, res, next) => {
    console.log(`GATEWAY RECEIVED REQUEST: Method=${req.method}, Path=${req.originalUrl}`);
    next();
});

// --- 基础路由规则 (Baseline 配置) ---

// 1. 处理 Service A (Baseline - 简单轮询)
/*
// --- 原动态路由逻辑 Start (注释掉) ---
app.use('/api/a', async (req, res) => {
    // ... 大量的动态路由选择、axios代理、状态更新代码 ...
});
// --- 原动态路由逻辑 End (注释掉) ---
*/
// +++ Baseline: 使用 express-http-proxy 的函数目标进行轮询 +++
app.use('/api/a', proxy((req) => {
    const instanceIndex = baselineRoundRobinCounter % SERVICE_A_INSTANCES.length;
    const targetInstance = SERVICE_A_INSTANCES[instanceIndex];
    baselineRoundRobinCounter++;
    console.log(`[Baseline Route A - RoundRobin] Selected instance ${targetInstance.id}`);
    return targetInstance.url; // 动态返回目标 URL
}, {
    proxyReqPathResolver: function (req) {
        const remainingPath = req.url;
        const newPath = '/serviceA' + remainingPath;
        console.log(`[Baseline Route A - RoundRobin] Rewriting path. Original relative path: ${req.url}, Target path: ${newPath}`);
        return newPath;
    },
    proxyErrorHandler: function(err, res, next) {
         console.error('[Baseline Route A - RoundRobin] Proxy Error:', err);
         if (!res.headersSent) { res.status(502).send('Proxy error occurred for Service A'); }
    }
}));


// 2. 转发到 Service B (保持不变, 使用 express-http-proxy)
app.use('/api/b', proxy(SERVICE_B_URL, {
    proxyReqPathResolver: function (req) {
        const remainingPath = req.url;
        const newPath = '/serviceB' + remainingPath;
        console.log(`[express-http-proxy B] Rewriting path. Original relative path: ${req.url}, Target path: ${newPath}`);
        return newPath;
    },
    proxyErrorHandler: function(err, res, next) {
        console.error('[express-http-proxy B] Proxy Error:', err);
        if (!res.headersSent) { res.status(502).send('Proxy error occurred for Service B'); }
    }
}));


// 3. 处理 Service C (Baseline - 无缓存，直接代理)
/*
// --- 原缓存逻辑 Start (注释掉) ---
app.get('/api/c/data', async (req, res) => {
    // ... 大量的 Redis 检查、axios 请求、缓存存储代码 ...
});
// --- 原缓存逻辑 End (注释掉) ---
*/
// +++ Baseline: 使用 express-http-proxy 直接转发 +++
app.use('/api/c', proxy(SERVICE_C_URL, {
    proxyReqPathResolver: function (req) {
        const remainingPath = req.url; // 例如: /data
        const newPath = '/serviceC' + remainingPath; // 拼接: /serviceC/data
        console.log(`[express-http-proxy C - Baseline] Rewriting path. Original relative path: ${req.url}, Target path: ${newPath}`);
        return newPath;
    },
    proxyErrorHandler: function(err, res, next) {
         console.error('[express-http-proxy C - Baseline] Proxy Error:', err);
         if (!res.headersSent) { res.status(502).send('Proxy error occurred for Service C'); }
    }
}));


// --- 启动网关服务器 ---
app.listen(PORT, () => {
    // 更新启动信息以反映 Baseline 配置
    console.log(`API Gateway (BASELINE - RoundRobin for A, No Cache for C) listening on port ${PORT}`);
    console.log(`Handling /api/a/* with round-robin routing to ${SERVICE_A_INSTANCES.map(i => i.url).join(', ')}`);
    console.log(`Forwarding /api/b/* to ${SERVICE_B_URL}`);
    console.log(`Forwarding /api/c/* to ${SERVICE_C_URL} (No Cache)`);
});