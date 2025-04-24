const express = require('express');
const app = express();
const port = 8081; // Service A 将运行在 8081 端口

app.get('/serviceA/fast', (req, res) => {
  console.log(`[Service A: ${port}] Received request on /fast`);
  res.json({ message: 'Response from Service A (fast)', instancePort: port });
});

app.listen(port, () => {
  console.log(`Mock Service A listening on port ${port}`);
});