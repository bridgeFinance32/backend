import express, {ErrorRequestHandler, Request, Response} from "express"
import Config from "./config/config"
import mongoose from "mongoose"
import { authRouter } from "./routes/authRoutes"
import { globalErrorHandler } from "./middlewares/errorMiddleware"
import cors from "cors"
import cookieParser from "cookie-parser"
import { balanceRouter } from "./routes/balanceRoutes"
import transactionRouter from "./routes/transactionalRoutes"
import { createWebSocketServer } from "./webSockets"
import { initializeTransactionSystem } from "./controllers/transactionControllers"
import serverless from "serverless-http"
const app = express()


const wss = createWebSocketServer()

const corsOptions = {
  origin: 'https://statescoinp2p.netlify.app',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.options('*', cors(corsOptions));

app.use(cors(corsOptions))
app.use(cookieParser())

const router = express.Router();
router.get('/', (req, res)=>{
  res.send('Welcome to StatesCoin P2P API');
})

app.use(express.json())
app.use("/api/v1",authRouter)
app.use("/api/v1", balanceRouter)
app.use('/api/v1', transactionRouter)

app.use(globalErrorHandler)


async function startServer() {
  try {
    // 1. First connect to MongoDB with proper options
    await mongoose.connect(Config.DB_URI, {
      serverSelectionTimeoutMS: 5000, // 5 seconds timeout
      socketTimeoutMS: 45000, // 45 seconds socket timeout
    });
    console.log('Database connected successfully');

    // 2. Initialize transaction system
    await initializeTransactionSystem();

    // 3. Start the server
    app.listen(Config.NODE_PORT, () => {
      console.log(`Server running on port ${Config.NODE_PORT}`);
      
      // Enable Mongoose debug in development
      if (process.env.NODE_ENV === 'development') {
        mongoose.set('debug', true);
      }
    });

  } catch (err) {
    console.error('Server startup failed:', err);
    
    // Graceful shutdown
    try {
      await mongoose.disconnect();
    } catch (disconnectErr) {
      console.error('Error disconnecting MongoDB:', disconnectErr);
    }
    
    process.exit(1);
  }
}

// Start the server
startServer();

// Handle process termination
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await mongoose.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await mongoose.disconnect();
  process.exit(0);
});


