const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mainRoutes = require("./routes");
const errorHandler = require("./middlewares/errorHandler");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Use routes
app.use("/api", mainRoutes);

// Test route
app.get('/', (req, res) => {
  res.send('API is running...');
});

app.use(errorHandler);

module.exports = app;