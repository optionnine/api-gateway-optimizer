import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics'; // 用于记录自定义指标

// --- 配置 ---
// ★★★ 注意：需要根据你的测试环境修改 TARGET_IP ★★★
// 如果在本地 Docker Compose 中测试，就是 'localhost'
// 如果在 AWS EC2 中测试，就是应用 EC2 实例的私有 IP
const TARGET_IP = 'localhost';
const BASE_URL = `http://${TARGET_IP}:8080`;

// 创建自定义指标来跟踪每个端点的响应时间
const metrics = {
    svc_a_fast_latency: new Trend('svc_a_fast_latency'),
    svc_a_slow_latency: new Trend('svc_a_slow_latency'),
    svc_b_slow_latency: new Trend('svc_b_slow_latency'),
    svc_c_data_latency: new Trend('svc_c_data_latency')
};

// --- 测试阶段配置 ---
export const options = {
    stages: [
        { duration: '30s', target: 50 },  // 预热：30秒内从0 VUs 增加到 50 VUs
        { duration: '1m', target: 50 },  // 稳定负载：50 VUs 运行 1 分钟
        { duration: '30s', target: 100 }, // 增加负载：30秒内增加到 100 VUs
        { duration: '1m', target: 100 }, // 稳定负载：100 VUs 运行 1 分钟
        { duration: '30s', target: 150 }, // 增加负载：30秒内增加到 150 VUs
        { duration: '1m', target: 150 }, // 稳定负载：150 VUs 运行 1 分钟
        { duration: '30s', target: 0 },    // 降载：30秒内减少到 0 VUs
    ],
    thresholds: {
        // 基础阈值示例：95% 的请求响应时间低于 800ms，错误率低于 1%
        'http_req_duration': ['p(95)<800'],
        'http_req_failed': ['rate<0.01'],
        // 也可以为特定端点设置阈值
        'svc_a_fast_latency': ['p(95)<100'],
        'svc_c_data_latency': ['p(95)<100'], // 期望缓存命中时很快
    },
};

// --- 主测试函数 ---
export default function () {
    // 根据比例随机选择一个请求
    const choice = Math.random();
    let res;
    let url;

    if (choice < 0.4) { // 40% 请求 /api/a/sometimesSlow
        url = `${BASE_URL}/api/a/sometimesSlow`;
        res = http.get(url);
        metrics.svc_a_slow_latency.add(res.timings.duration); // 记录响应时间
    } else if (choice < 0.9) { // 50% 请求 /api/c/data (0.4 到 0.9 之间)
        url = `${BASE_URL}/api/c/data`;
        res = http.get(url);
        metrics.svc_c_data_latency.add(res.timings.duration);
    } else { // 10% 请求 /api/b/slow
        url = `${BASE_URL}/api/b/slow`;
        res = http.get(url);
        metrics.svc_b_slow_latency.add(res.timings.duration);
    }

    // 也可以加入 /api/a/fast 的请求来记录其延迟
    // if (choice < 0.1) { // 例如，单独分配 10% 给 fast
    //     url = `${BASE_URL}/api/a/fast`;
    //     res = http.get(url);
    //     metrics.svc_a_fast_latency.add(res.timings.duration);
    // } else if (choice < 0.5) { // ... 调整其他比例 ...

    // 检查响应状态码
    check(res, {
        'status is 200': (r) => r.status === 200,
    });

    // 可选：模拟用户思考时间
    // sleep(1); // 等待 1 秒
}