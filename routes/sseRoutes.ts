// routes/sseRoutes.ts
import express from 'express';
import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import cron from 'node-cron';
import { SSEService } from '../Utils/sseService';
import { authenticate } from '../middlewares/authMiddleware';

export const sseRouter = express.Router();

sseRouter.get('/balances/:id', authenticate , (req: Request, res: Response) => {
    const { id } = req.params;
    
    if (!isValidObjectId(id)) {
        return res.status(400).json({ 
            status: 'error',
            message: 'Invalid ID format' 
        });
    }

    // No try-catch needed as SSEService handles errors
    SSEService.addClient(id, res);
});

// Scheduled Price Updates
cron.schedule('*/2 * * * *', async () => {
    try {
        console.log('[Cron] Updating crypto prices...');
        await SSEService.notifyAll();
        console.log('[Cron] Price updates completed');
    } catch (error) {
        console.error('[Cron] Price update failed:', error);
    }
});

// Cleanup on server shutdown
['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
        console.log('Closing all SSE connections...');
        SSEService.closeAll();
        process.exit();
    });
});