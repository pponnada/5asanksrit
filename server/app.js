const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session');
const { PORT, SESSION_SECRET } = require('./config');

require('./db/db'); // ensures schema is created on boot

const studentRoutes = require('./routes/student');
const adminRoutes = require('./routes/admin');
const flashcardsRoutes = require('./routes/flashcards');
const builderRoutes = require('./routes/builder');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(
  cookieSession({
    name: 'session',
    secret: SESSION_SECRET,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days — Teacher's PIN session
  })
);

app.use(studentRoutes);
app.use(adminRoutes);
app.use(flashcardsRoutes);
app.use(builderRoutes);

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    // Bound to all interfaces so it's reachable from any device on the LAN;
    // staying off the public internet relies on the home router not
    // forwarding this port — no separate auth layer for the Student surface
    // by design (REQUIREMENTS.md §10).
    console.log(`Sanskrit app listening on http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
