import express from "express";
import { createServer } from 'http';
import { createWebSocketServer } from "./webSockets";
import Config from "./config/config";
import mongoose from "mongoose";
import { authRouter } from "./routes/authRoutes";
import { globalErrorHandler } from "./middlewares/errorMiddleware";
import cors from "cors";
import cookieParser from "cookie-parser";
import { balanceRouter } from "./routes/balanceRoutes";
import transactionRouter from "./routes/transactionalRoutes";
import { initializeTransactionSystem } from "./controllers/transactionControllers";

const app = express();
const server = createServer(app);

// Enhanced CORS configuration
const corsOptions = {
    origin: 'https://statescoinp2p.netlify.app',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'UPGRADE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Connection', 'Upgrade']
};

// Middleware
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

// Routes
app.use("/api/v1", authRouter);
app.use("/api/v1", balanceRouter);
app.use('/api/v1', transactionRouter);
app.use(globalErrorHandler);

// WebSocket setup
const { wss, handleUpgrade } = createWebSocketServer(server);

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
async function startServer() {
    try {
        // Database connection
        await mongoose.connect(Config.DB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log('Database connected successfully');

        // Initialize systems
        await initializeTransactionSystem();

        // Start server
        const PORT = process.env.PORT || Config.NODE_PORT;
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`WebSocket endpoint: wss://your-render-service.onrender.com`);
            
            if (process.env.NODE_ENV === 'development') {
                mongoose.set('debug', true);
            }
        });

    } catch (err) {
        console.error('Server startup failed:', err);
        process.exit(1);
    }
}

// Process handlers
process.on('SIGTERM', async () => {
    console.log('SIGTERM received - shutting down gracefully');
    await mongoose.disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received - shutting down gracefully');
    await mongoose.disconnect();
    process.exit(0);
});

startServer();