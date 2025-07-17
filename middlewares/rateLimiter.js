"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authLimiter = void 0;
const express_rate_limit_1 = require("express-rate-limit");
exports.authLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // Limit each IP to 5 requests per windowMs
    message: {
        status: "fail",
        message: "Too many login attempts from this IP, please try again after 15 minutes.",
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
