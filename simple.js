const express = require('express');
const app = express();
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log('Simple server up on port ' + port);
});