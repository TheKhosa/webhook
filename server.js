const express = require('express');
const app = express();

app.use(express.json());

app.post('/webhook', (req, res) => {
  console.log('Webhook received:', req.body);
  res.json({ received: true });
});

app.listen(process.env.PORT || 3000);
