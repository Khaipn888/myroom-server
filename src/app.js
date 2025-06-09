const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mainRoutes = require("./routes");
const errorHandler = require("./middlewares/errorHandler");
const cookieParser = require("cookie-parser");

const app = express();

const elasticClient = require("./utils/elasticsearchClient");

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL, // Cho phép frontend truy cập
    credentials: true, // Cho phép gửi cookie, header Authorization...
  })
);
app.use(express.json());
app.use(morgan('dev'));
app.use(cookieParser());

// Use routes
app.use("/api", mainRoutes);

// Test route
app.get('/', (req, res) => {
  res.send('API is running...');
});

app.use(errorHandler);

module.exports = app;