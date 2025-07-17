"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalErrorHandler = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const globalErrorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || "error";
    const isDevelopment = process.env.NODE_ENV === 'development';
    console.error('🔴 Error:', Object.assign(Object.assign({ name: err.name, message: err.message, stack: err.stack, url: req.originalUrl, method: req.method }, (err.code && { code: err.code })), (err.errors && { errors: err.errors })));
    // 1. Mongoose Validation Error
    if (err instanceof mongoose_1.default.Error.ValidationError) {
        res.status(400).json({
            status: "fail",
            message: "Validation Error",
            errors: Object.values(err.errors).map(e => e.message)[0],
        });
        return;
    }
    // 2. MongoDB Duplicate Key
    if (err.code === 11000) {
        res.status(409).json({
            status: "fail",
            message: "Duplicate field value",
            fields: err.keyValue,
        });
        return;
    }
    // 3. Operational errors
    if (err.isOperational) {
        res.status(err.statusCode).json({
            status: err.status,
            message: err.message,
        });
        return;
    }
    // 4. Unknown errors
    res.status(500).json(Object.assign({ status: "error", message: "Something went wrong!" }, (isDevelopment && {
        error: err.message,
        stack: err.stack,
    })));
};
exports.globalErrorHandler = globalErrorHandler;
