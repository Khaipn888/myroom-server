module.exports = {
    env: {
      node: true,
      commonjs: true,
      es2021: true,
    },
    extends: [
      "eslint:recommended",
      "plugin:prettier/recommended", // Dùng Prettier làm chuẩn format
    ],
    parserOptions: {
      ecmaVersion: "latest",
    },
    rules: {
      "no-unused-vars": "warn",     // Cảnh báo khi có biến không dùng
      "no-console": "off",          // Cho phép dùng console.log
      "prettier/prettier": [
        "error",
        {
          semi: true,
          singleQuote: false,
          printWidth: 100,
          tabWidth: 2,
          trailingComma: "es5",
        },
      ],
    },
  };
  