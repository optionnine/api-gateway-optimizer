const express = require('express');
// const { createProxyMiddleware } = require('http-proxy-middleware'); // 不再使用旧库
const proxy = require('express-http-proxy'); // 引入新库

const app = express();
const PORT = 8080; // API Gateway 将运行在 8080 端口

// --- 服务地址配置 ---
const SERVICE_A_URL = 'http://localhost:8081';
const SERVICE_B_URL = 'http://localhost:8083';
const SERVICE_C_URL = 'http://localhost:8084';

// --- 日志中间件 (确认请求到达) ---
app.use((req, res, next) => {
    console.log(`GATEWAY RECEIVED REQUEST: Method=${req.method}, Path=${req.originalUrl}`);
    next();
});

// --- 基础路由规则 ---

// 1. 转发到 Service A (使用 express-http-proxy, 修正路径重写)
app.use('/api/a', proxy(SERVICE_A_URL, {
    // 这个函数用来重写将要发送给后端服务的路径
    proxyReqPathResolver: function (req) {
        // req.url 是相对于 /api/a 的路径，例如 /fast
        // 我们需要将其拼接到目标服务的基础路径 /serviceA 上
        const remainingPath = req.url; // 例如: /fast
        const newPath = '/serviceA' + remainingPath; // 正确拼接: /serviceA/fast
        console.log(`[express-http-proxy] Rewriting path. Original relative path: ${req.url}, Target path: ${newPath}`);
        return newPath; // 返回目标服务期望的完整路径
    },
    // 可选：添加更多日志或处理
    proxyErrorHandler: function(err, res, next) {
        console.error('[express-http-proxy] Proxy Error:', err);
        // 发送一个错误响应给客户端，而不是让连接挂起或显示默认错误
        if (!res.headersSent) {
            res.status(500).send('Proxy error occurred');
        }
        // 不一定调用 next(err)，根据需要决定是否继续 Express 的错误处理流程
        // next(err);
    }
}));

// 2. 转发到 Service B (使用 express-http-proxy 示例)
app.use('/api/b', proxy(SERVICE_B_URL, {
    proxyReqPathResolver: function (req) {
        const remainingPath = req.url; // 例如: /slow
        const newPath = '/serviceB' + remainingPath; // 拼接: /serviceB/slow
        console.log(`[express-http-proxy] Rewriting path. Original relative path: ${req.url}, Target path: ${newPath}`);
        return newPath;
    },
    proxyErrorHandler: function(err, res, next) {
        console.error('[express-http-proxy] Proxy Error:', err);
        if (!res.headersSent) {
            res.status(500).send('Proxy error occurred');
        }
    }
}));

// 3. 转发到 Service C (使用 express-http-proxy 示例)
app.use('/api/c', proxy(SERVICE_C_URL, {
    proxyReqPathResolver: function (req) {
        const remainingPath = req.url; // 例如: /data
        const newPath = '/serviceC' + remainingPath; // 拼接: /serviceC/data
        console.log(`[express-http-proxy] Rewriting path. Original relative path: ${req.url}, Target path: ${newPath}`);
        return newPath;
    },
    proxyErrorHandler: function(err, res, next) {
        console.error('[express-http-proxy] Proxy Error:', err);
        if (!res.headersSent) {
            res.status(500).send('Proxy error occurred');
        }
    }
}));


// --- 启动网关服务器 ---
app.listen(PORT, () => {
    console.log(`API Gateway (using express-http-proxy) listening on port ${PORT}`);
    console.log(`Forwarding /api/a/* to ${SERVICE_A_URL}`);
    console.log(`Forwarding /api/b/* to ${SERVICE_B_URL}`);
    console.log(`Forwarding /api/c/* to ${SERVICE_C_URL}`);
});