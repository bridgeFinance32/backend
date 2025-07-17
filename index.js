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
const http_1 = require("http");
const webSockets_1 = require("./webSockets");
const config_1 = __importDefault(require("./config/config"));
const mongoose_1 = __importDefault(require("mongoose"));
const authRoutes_1 = require("./routes/authRoutes");
const errorMiddleware_1 = require("./middlewares/errorMiddleware");
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const balanceRoutes_1 = require("./routes/balanceRoutes");
const transactionalRoutes_1 = __importDefault(require("./routes/transactionalRoutes"));
const transactionControllers_1 = require("./controllers/transactionControllers");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
// Enhanced CORS configuration
const corsOptions = {
    origin: 'https://statescoinp2p.netlify.app',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'UPGRADE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Connection', 'Upgrade']
};
// Middleware
app.options('*', (0, cors_1.default)(corsOptions));
app.use((0, cors_1.default)(corsOptions));
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json());
// Routes
app.use("/api/v1", authRoutes_1.authRouter);
app.use("/api/v1", balanceRoutes_1.balanceRouter);
app.use('/api/v1', transactionalRoutes_1.default);
app.use(errorMiddleware_1.globalErrorHandler);
// WebSocket setup
const { wss, handleUpgrade } = (0, webSockets_1.createWebSocketServer)(server);
// Handle WebSocket upgrades
server.on('upgrade', (req, socket, head) => {
    // Origin check
    if (req.headers.origin !== corsOptions.origin) {
        console.log(`Rejected WebSocket upgrade from invalid origin: ${req.headers.origin}`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
    }
    handleUpgrade(req, socket, head);
});
// Server startup
function startServer() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Database connection
            yield mongoose_1.default.connect(config_1.default.DB_URI, {
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });
            console.log('Database connected successfully');
            // Initialize systems
            yield (0, transactionControllers_1.initializeTransactionSystem)();
            // Start server
            const PORT = process.env.PORT || config_1.default.NODE_PORT;
            server.listen(PORT, () => {
                console.log(`Server running on port ${PORT}`);
                console.log(`WebSocket endpoint: wss://your-render-service.onrender.com`);
                if (process.env.NODE_ENV === 'development') {
                    mongoose_1.default.set('debug', true);
                }
            });
        }
        catch (err) {
            console.error('Server startup failed:', err);
            process.exit(1);
        }
    });
}
// Process handlers
process.on('SIGTERM', () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('SIGTERM received - shutting down gracefully');
    yield mongoose_1.default.disconnect();
    process.exit(0);
}));
process.on('SIGINT', () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('SIGINT received - shutting down gracefully');
    yield mongoose_1.default.disconnect();
    process.exit(0);
}));
startServer();
