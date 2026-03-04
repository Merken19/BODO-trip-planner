const express = require('express');
const path = require('path');
const { addFreeDate, removeFreeDate, getFreeDatesByMonth, getPeople } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Validation helpers
function isValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function isValidMonth(str) {
  return /^\d{4}-\d{2}$/.test(str);
}

function isValidName(str) {
  return typeof str === 'string' && str.trim().length > 0 && str.trim().length <= 50;
}

// GET /api/dates?month=YYYY-MM
app.get('/api/dates', (req, res) => {
  const { month } = req.query;
  if (!month || !isValidMonth(month)) {
    return res.status(400).json({ error: 'month query parameter required (YYYY-MM)' });
  }
  const dates = getFreeDatesByMonth(month);
  res.json({ dates });
});

// POST /api/dates
app.post('/api/dates', (req, res) => {
  const { name, date } = req.body;
  if (!isValidName(name)) {
    return res.status(400).json({ error: 'name is required (1-50 characters)' });
  }
  if (!date || !isValidDate(date)) {
    return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
  }
  const result = addFreeDate(name, date);
  res.status(result.added ? 201 : 200).json({ ok: true, existed: !result.added });
});

// DELETE /api/dates
app.delete('/api/dates', (req, res) => {
  const { name, date } = req.body;
  if (!isValidName(name)) {
    return res.status(400).json({ error: 'name is required (1-50 characters)' });
  }
  if (!date || !isValidDate(date)) {
    return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
  }
  removeFreeDate(name, date);
  res.json({ ok: true });
});

// GET /api/people
app.get('/api/people', (req, res) => {
  const people = getPeople();
  res.json({ people });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DatePicker server running on port ${PORT}`);
});
