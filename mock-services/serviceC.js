const express = require('express');
const app = express();
const port = 8084; // Service C 将运行在 8084 端口

// 模拟一些不变的数据
const productData = {
  id: 123,
  name: 'Product X',
  description: 'A sample product that can be cached.',
  timestamp: Date.now() // 加个时间戳方便看缓存是否更新
};

app.get('/serviceC/data', (req, res) => {
  console.log(`[Service C: ${port}] Received request on /data`);
  // 更新时间戳，这样如果没缓存，每次获取的数据略有不同
  productData.timestamp = Date.now();
  res.json(productData);
});

app.listen(port, () => {
  console.log(`Mock Service C listening on port ${port}`);
});