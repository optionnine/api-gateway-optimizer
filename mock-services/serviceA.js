const express = require('express');
const app = express();

// 从命令行参数获取端口号，如果没有提供，默认为 8081
// process.argv[2] 是运行命令时跟在 'node serviceA.js' 后面的第一个参数
const port = process.argv[2] || 8081;
const instanceId = `ServiceA@${port}`; // 给实例一个唯一标识

app.get('/serviceA/fast', (req, res) => {
  console.log(`[${instanceId}] Received request on /fast`);
  // 在响应中也包含实例端口，方便调试
  res.json({ message: 'Response from Service A (fast)', instancePort: parseInt(port) });
});

// (可选) 添加一个模拟变慢的接口，方便测试动态路由效果
app.get('/serviceA/sometimesSlow', (req, res) => {
    const shouldBeSlow = Math.random() < 0.3; // 30% 的概率变慢
    const delay = shouldBeSlow ? 500 : 10; // 慢则 500ms，快则 10ms
    console.log(`[${instanceId}] Received request on /sometimesSlow. Delaying ${delay}ms`);
    setTimeout(() => {
        res.json({ message: 'Response from Service A (sometimes slow)', instancePort: parseInt(port), wasSlow: shouldBeSlow, delayMs: delay });
    }, delay);
});


app.listen(port, () => {
  console.log(`Mock Service A instance [${instanceId}] listening on port ${port}`);
});