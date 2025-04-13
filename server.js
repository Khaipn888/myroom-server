// index.js
const dotenv = require('dotenv-flow');
dotenv.config(); // tự động dùng .env.[NODE_ENV]

const express = require('express');
const mongoose = require('mongoose');
const app = require('./src/app');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log(`✅ Connected to MongoDB - ${process.env.NODE_ENV}`);
  } catch (err) {
    console.error('❌ DB connection failed:', err);
    process.exit(1);
  }
};

connectDB();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} - ${process.env.NODE_ENV}`);
});
