const express = require('express');
const app = express();
const port = 8083; // Service B 将运行在 8083 端口
const delay = 200; // 模拟 200ms 延迟

app.get('/serviceB/slow', (req, res) => {
  console.log(`[Service B: ${port}] Received request on /slow, delaying for ${delay}ms`);
  setTimeout(() => {
    res.json({ message: 'Response from Service B (slow)', instancePort: port, delayMs: delay });
  }, delay);
});

app.listen(port, () => {
  console.log(`Mock Service B listening on port ${port}`);
});