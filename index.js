"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const config_1 = __importDefault(require("./config/config"));
const mongoose_1 = __importDefault(require("mongoose"));
const authRoutes_1 = require("./routes/authRoutes");
const errorMiddleware_1 = require("./middlewares/errorMiddleware");
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const balanceRoutes_1 = require("./routes/balanceRoutes");
const transactionalRoutes_1 = __importDefault(require("./routes/transactionalRoutes"));
const webSockets_1 = require("./webSockets");
const transactionControllers_1 = require("./controllers/transactionControllers");
const app = (0, express_1.default)();
const wss = (0, webSockets_1.createWebSocketServer)();
const corsOptions = {
    origin: 'https://statescoinp2p.netlify.app', // Your frontend origin
    credentials: true, // Allow credentials (cookies)
    optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};
app.use((0, cors_1.default)(corsOptions));
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json());
app.use("/api/v1", authRoutes_1.authRouter);
app.use("/api/v1", balanceRoutes_1.balanceRouter);
app.use('/api/v1', transactionalRoutes_1.default);
app.use(errorMiddleware_1.globalErrorHandler);
app.set("trust proxy", 1);
function startServer() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // 1. First connect to MongoDB with proper options
            yield mongoose_1.default.connect(config_1.default.DB_URI, {
                serverSelectionTimeoutMS: 5000, // 5 seconds timeout
                socketTimeoutMS: 45000, // 45 seconds socket timeout
            });
            console.log('Database connected successfully');
            // 2. Initialize transaction system
            yield (0, transactionControllers_1.initializeTransactionSystem)();
            // 3. Start the server
            app.listen(config_1.default.NODE_PORT, () => {
                console.log(`Server running on port ${config_1.default.NODE_PORT}`);
                // Enable Mongoose debug in development
                if (process.env.NODE_ENV === 'development') {
                    mongoose_1.default.set('debug', true);
                }
            });
        }
        catch (err) {
            console.error('Server startup failed:', err);
            // Graceful shutdown
            try {
                yield mongoose_1.default.disconnect();
            }
            catch (disconnectErr) {
                console.error('Error disconnecting MongoDB:', disconnectErr);
            }
            process.exit(1);
        }
    });
}
// Start the server
startServer();
// Handle process termination
process.on('SIGTERM', () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('SIGTERM received. Shutting down gracefully...');
    yield mongoose_1.default.disconnect();
    process.exit(0);
}));
process.on('SIGINT', () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('SIGINT received. Shutting down gracefully...');
    yield mongoose_1.default.disconnect();
    process.exit(0);
}));
