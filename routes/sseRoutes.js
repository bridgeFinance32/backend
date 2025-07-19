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
exports.sseRouter = void 0;
// routes/sseRoutes.ts
const express_1 = __importDefault(require("express"));
const mongoose_1 = require("mongoose");
const node_cron_1 = __importDefault(require("node-cron"));
const sseService_1 = require("../Utils/sseService");
exports.sseRouter = express_1.default.Router();
exports.sseRouter.get('/balances/:id', (req, res) => {
    const { id } = req.params;
    if (!(0, mongoose_1.isValidObjectId)(id)) {
        return res.status(400).json({
            status: 'error',
            message: 'Invalid ID format'
        });
    }
    // No try-catch needed as SSEService handles errors
    sseService_1.SSEService.addClient(id, res);
});
// Scheduled Price Updates
node_cron_1.default.schedule('*/2 * * * *', () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('[Cron] Updating crypto prices...');
        yield sseService_1.SSEService.notifyAll();
        console.log('[Cron] Price updates completed');
    }
    catch (error) {
        console.error('[Cron] Price update failed:', error);
    }
}));
// Cleanup on server shutdown
['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
        console.log('Closing all SSE connections...');
        sseService_1.SSEService.closeAll();
        process.exit();
    });
});
