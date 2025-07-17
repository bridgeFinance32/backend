"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
const Config = {
    NODE_ENV: process.env.NODE_ENV || "PRODUCTION",
    DB_URI: process.env.DB_URI,
    NODE_PORT: process.env.NODE_PORT || "5050",
    ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET
};
exports.default = Config;
