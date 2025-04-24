const express = require('express');
const proxy = require('express-http-proxy'); // 保留，因为 Service A 和 B 还在用
const Redis = require('ioredis');          // 引入 ioredis
const axios = require('axios');            // 引入 axios

const app = express();
const PORT = 8080;

// --- Redis 配置 ---
const redisClient = new Redis({
    // 默认连接本地 Redis: 127.0.0.1:6379
    // 如果你的 Redis 在不同地址或端口，在这里配置
    // 例如: host: 'other-host', port: 6380
    // keyPrefix: "api_gateway_cache:" // 可选：给所有 key 加个前缀
});

// --- 服务地址配置 ---
const SERVICE_A_URL = 'http://localhost:8081';
const SERVICE_B_URL = 'http://localhost:8083';
const SERVICE_C_URL = 'http://localhost:8084'; // Service C 的基础 URL

// --- 日志中间件 ---
app.use((req, res, next) => {
    console.log(`GATEWAY RECEIVED REQUEST: Method=${req.method}, Path=${req.originalUrl}`);
    next();
});

// --- 基础路由规则 ---

// 1. 转发到 Service A (保持不变)
app.use('/api/a', proxy(SERVICE_A_URL, {
    proxyReqPathResolver: function (req) {
        const remainingPath = req.url;
        const newPath = '/serviceA' + remainingPath;
        console.log(`[express-http-proxy A] Rewriting path. Original relative path: ${req.url}, Target path: ${newPath}`);
        return newPath;
    },
    proxyErrorHandler: function(err, res, next) { /* ... 错误处理 ... */ }
}));

// 2. 转发到 Service B (保持不变)
app.use('/api/b', proxy(SERVICE_B_URL, {
    proxyReqPathResolver: function (req) {
        const remainingPath = req.url;
        const newPath = '/serviceB' + remainingPath;
        console.log(`[express-http-proxy B] Rewriting path. Original relative path: ${req.url}, Target path: ${newPath}`);
        return newPath;
    },
    proxyErrorHandler: function(err, res, next) { /* ... 错误处理 ... */ }
}));

// 3. 处理 Service C (实现 Redis 缓存)
//   我们不再直接用 proxy，而是自定义处理逻辑
app.get('/api/c/data', async (req, res) => { // 注意：这里用了 app.get 精确匹配，并设为 async 函数
    const cacheKey = `cache:${req.originalUrl}`; // 定义缓存的 key，例如 "cache:/api/c/data"
    const CACHE_EXPIRATION_SECONDS = 60; // 缓存过期时间（秒）

    try {
        // 1. 检查 Redis 缓存
        console.log(`[Cache C] Checking cache for key: ${cacheKey}`);
        const cachedData = await redisClient.get(cacheKey);

        if (cachedData) {
            // 缓存命中 (Cache Hit)
            console.log(`[Cache C] Cache HIT for key: ${cacheKey}`);
            // 直接返回缓存的数据 (需要从 JSON 字符串解析回对象)
            res.json(JSON.parse(cachedData));
        } else {
            // 缓存未命中 (Cache Miss)
            console.log(`[Cache C] Cache MISS for key: ${cacheKey}. Fetching from backend.`);

            // 2. 访问后端 Service C 获取数据
            const backendUrl = SERVICE_C_URL + '/serviceC/data'; // 构造后端 URL
            try {
                const backendResponse = await axios.get(backendUrl);
                const backendData = backendResponse.data; // 获取后端返回的 JSON 数据

                console.log(`[Cache C] Fetched data from backend. Status: ${backendResponse.status}`);

                // 3. 将数据存入 Redis 缓存
                //    需要将对象转换为 JSON 字符串存储
                //    使用 'EX' 设置过期时间（单位：秒）
                await redisClient.set(cacheKey, JSON.stringify(backendData), 'EX', CACHE_EXPIRATION_SECONDS);
                console.log(`[Cache C] Data stored in cache for key: ${cacheKey} with ${CACHE_EXPIRATION_SECONDS}s TTL`);

                // 4. 将数据返回给客户端
                res.json(backendData);

            } catch (error) {
                // 处理访问后端服务时的错误
                console.error(`[Cache C] Error fetching data from backend (${backendUrl}):`, error.message);
                // 可以根据 error.response.status 等信息返回更具体的错误码
                res.status(502).json({ message: 'Error fetching data from backend service.' }); // 502 Bad Gateway
            }
        }
    } catch (error) {
        // 处理访问 Redis 或其他意外错误
        console.error('[Cache C] Error during cache check or processing:', error);
        res.status(500).json({ message: 'Internal server error during caching.' });
    }
});

// --- 启动网关服务器 ---
app.listen(PORT, () => {
    console.log(`API Gateway (with Redis Cache for C) listening on port ${PORT}`);
    console.log(`Forwarding /api/a/* to ${SERVICE_A_URL}`);
    console.log(`Forwarding /api/b/* to ${SERVICE_B_URL}`);
    console.log(`Handling /api/c/data with cache`); // 更新启动信息
});