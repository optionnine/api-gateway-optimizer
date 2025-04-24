const express = require('express');
const proxy = require('express-http-proxy'); // Service B 还在用
const Redis = require('ioredis');
const axios = require('axios');

const app = express();
const PORT = 8080;

// --- Redis 配置 ---
const redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost', // 读取环境变量，提供默认值
    port: process.env.REDIS_PORT || 6379,     // 读取环境变量，提供默认值
    // keyPrefix: "api_gateway_cache:"
});

// --- 服务地址配置 ---
// 从环境变量读取，提供本地运行时的默认值
const SERVICE_A_INSTANCES = [
    { id: 'A1', url: process.env.SERVICE_A1_URL || 'http://localhost:8081' },
    { id: 'A2', url: process.env.SERVICE_A2_URL || 'http://localhost:8082' }
];
const SERVICE_B_URL = process.env.SERVICE_B_URL || 'http://localhost:8083';
const SERVICE_C_URL = process.env.SERVICE_C_URL || 'http://localhost:8084';

// --- 动态路由状态 (确保在 SERVICE_A_INSTANCES 定义之后初始化) ---
const instanceStats = {};
SERVICE_A_INSTANCES.forEach(instance => {
    instanceStats[instance.id] = { responseTime: undefined, lastRequestTime: 0 };
});

// --- 探索策略配置 ---
const EXPLORATION_PROBABILITY = 0.1; // 10% 的概率进行随机探索


// --- 日志中间件 ---
app.use((req, res, next) => {
    console.log(`GATEWAY RECEIVED REQUEST: Method=${req.method}, Path=${req.originalUrl}`);
    next();
});

// --- 基础路由规则 ---

// 1. 处理 Service A (最小响应时间 + 随机探索)
app.use('/api/a', async (req, res) => {
    console.log('-----------------------------------------');
    console.log('[DEBUG] Selecting instance for path:', req.url, 'using MinResponseTime + Exploration');
    console.log('[DEBUG] Current instance stats:', JSON.stringify(instanceStats));

    let selectedInstance = null;

    // --- 决定是否进行探索 ---
    const explore = Math.random() < EXPLORATION_PROBABILITY;

    if (explore) {
        // --- 探索：从所有实例中随机选择 ---
        selectedInstance = SERVICE_A_INSTANCES[Math.floor(Math.random() * SERVICE_A_INSTANCES.length)];
        console.log(`[Dynamic Route A - Exploration] Randomly selected instance ${selectedInstance.id}`);
    } else {
        // --- 主要策略：选择响应时间最短的 ---
        let minTime = Infinity;
        let candidates = [];

        SERVICE_A_INSTANCES.forEach(instance => {
            // 使用可选链 (?.) 避免访问 undefined 的属性时出错
            const lastResponseTime = instanceStats[instance.id]?.responseTime === undefined ? Infinity : instanceStats[instance.id].responseTime;
            console.log(`[DEBUG] Checking instance ${instance.id}, lastTime: ${lastResponseTime}, current minTime: ${minTime}`);

            if (lastResponseTime < minTime) {
                minTime = lastResponseTime;
                candidates = [instance];
                console.log(`[DEBUG] --> New minTime ${minTime}, candidates reset to [${instance.id}]`);
            } else if (lastResponseTime === minTime && minTime !== Infinity) {
                candidates.push(instance);
                console.log(`[DEBUG] --> Same minTime ${minTime}, candidates now [${candidates.map(c=>c.id).join(',')}]`);
            }
        });

        if (candidates.length === 0) {
            console.log('[DEBUG] No valid stats found (all Infinity or undefined), considering all instances as candidates for selection.');
            candidates = [...SERVICE_A_INSTANCES];
            minTime = Infinity;
        }

        selectedInstance = candidates[Math.floor(Math.random() * candidates.length)];
        console.log(`[Dynamic Route A - Optimal] Choosing from ${candidates.length} best candidate(s). Selected ${selectedInstance.id} (min time was: ${minTime === Infinity ? 'N/A' : minTime + 'ms'})`);
    }

    // b. 构造目标 URL 和路径
    const targetUrl = selectedInstance.url;
    const remainingPath = req.url;
    const targetPath = '/serviceA' + remainingPath;

    // c. 手动代理请求 (使用 axios)
    const startTime = Date.now();
    try {
        const backendResponse = await axios({
            method: req.method,
            url: targetUrl + targetPath,
            headers: {
                'Accept': req.headers['accept'],
                'User-Agent': req.headers['user-agent']
            },
            params: req.query,
            responseType: 'stream',
            timeout: 5000 // 添加超时设置 (例如 5 秒)
        });

        const endTime = Date.now();
        const responseTime = endTime - startTime;
        console.log(`[Dynamic Route A] Instance ${selectedInstance.id} responded successfully in ${responseTime}ms`);

        // d. 更新实例响应时间统计
        instanceStats[selectedInstance.id].responseTime = responseTime;
        instanceStats[selectedInstance.id].lastRequestTime = endTime;
        console.log(`[DEBUG] Updated instance stats for ${selectedInstance.id}:`, JSON.stringify(instanceStats[selectedInstance.id]));

        // e. 将后端响应流式传输回客户端
        res.status(backendResponse.status);
        res.set('Content-Type', backendResponse.headers['content-type']);
        backendResponse.data.pipe(res);

    } catch (error) {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        console.error(`[Dynamic Route A] Error requesting instance ${selectedInstance.id} (took ${responseTime}ms):`, error.message);

        instanceStats[selectedInstance.id].responseTime = Infinity;
        instanceStats[selectedInstance.id].lastRequestTime = endTime;
        console.log(`[DEBUG] Updated instance stats for ${selectedInstance.id}: Infinity (due to error)`);

        if (error.response) {
            res.status(error.response.status).send(error.response.data);
        } else if (error.code === 'ECONNABORTED') { // 处理 axios 超时
             res.status(504).json({ message: 'Gateway Timeout - Backend instance timed out.' });
        } else {
            res.status(502).json({ message: 'Bad Gateway - Error contacting backend instance.' });
        }
    }
    console.log('-----------------------------------------');
});


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

// 3. 处理 Service C (缓存逻辑保持不变)
app.get('/api/c/data', async (req, res) => {
    const cacheKey = `cache:${req.originalUrl}`;
    const CACHE_EXPIRATION_SECONDS = 60;
    try {
        // ... (缓存检查代码) ...
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
            // ... (缓存命中处理) ...
            res.json(JSON.parse(cachedData));
        } else {
            // ... (缓存未命中处理) ...
            const backendUrl = SERVICE_C_URL + '/serviceC/data';
            try {
                const backendResponse = await axios.get(backendUrl);
                // ... (获取后端数据, 存缓存, 返回数据) ...
                 const backendData = backendResponse.data;
                await redisClient.set(cacheKey, JSON.stringify(backendData), 'EX', CACHE_EXPIRATION_SECONDS);
                res.json(backendData);
            } catch (error) {
                // ... (处理后端错误) ...
                 res.status(502).json({ message: 'Error fetching data from backend service C.' });
            }
        }
    } catch (error) {
        // ... (处理 Redis 错误) ...
        res.status(500).json({ message: 'Internal server error during caching for Service C.' });
    }
});


// --- 启动网关服务器 ---
app.listen(PORT, () => {
    console.log(`API Gateway (MinResponseTime+Explore for A, Cache for C) listening on port ${PORT}`);
    console.log(`Handling /api/a/* with MinResponseTime+Explore routing to ${SERVICE_A_INSTANCES.map(i => i.url).join(', ')}`);
    console.log(`Forwarding /api/b/* to ${SERVICE_B_URL}`);
    console.log(`Handling /api/c/data with cache`);
});