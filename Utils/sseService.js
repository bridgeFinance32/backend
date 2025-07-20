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
exports.SSEService = void 0;
const userModel_1 = require("../model/userModel");
const axios_1 = __importDefault(require("axios"));
const symbolToIdMap = {
    btc: "bitcoin",
    eth: "ethereum",
    link: "chainlink",
    bnb: "binancecoin",
    usdt: "tether",
    usdc: "usd-coin",
};
class SSEService {
    static addClient(userId, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Set SSE headers
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });
                // Store connection
                this.clients.set(userId, res);
                // Send initial connection confirmation
                res.write('event: connection\n');
                res.write('data: ' + JSON.stringify({ status: 'connected' }) + '\n\n');
                // Send initial balance
                yield this.sendBalanceUpdate(userId);
                // Heartbeat to keep connection alive
                const heartbeat = setInterval(() => {
                    if (this.clients.has(userId)) {
                        res.write(': heartbeat\n\n');
                    }
                    else {
                        clearInterval(heartbeat);
                    }
                }, 30000);
                // Handle cleanup
                res.on('close', () => {
                    clearInterval(heartbeat);
                    this.removeClient(userId);
                });
            }
            catch (error) {
                console.error(`Error adding client ${userId}:`, error);
                if (!res.headersSent) {
                    res.status(500).end();
                }
            }
        });
    }
    static sendBalanceUpdate(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const user = yield userModel_1.User.findById(userId).lean().exec();
                if (!user) {
                    console.warn(`User ${userId} not found`);
                    return;
                }
                const balances = user.balances;
                const coinIds = this.getValidCoinIds(balances);
                if (coinIds.length === 0)
                    return;
                const prices = yield this.getPrices(coinIds);
                const balanceData = this.calculateBalanceData(balances, prices);
                this.sendToClient(userId, 'balance_update', balanceData);
            }
            catch (error) {
                console.error(`Error updating balance for ${userId}:`, error);
            }
        });
    }
    static getValidCoinIds(balances) {
        return Object.keys(balances)
            .map(key => symbolToIdMap[key])
            .filter(Boolean);
    }
    static getPrices(coinIds) {
        return __awaiter(this, void 0, void 0, function* () {
            if (Date.now() - this.lastFetchTime < this.CACHE_DURATION) {
                return this.cachedPrices;
            }
            try {
                const response = yield axios_1.default.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd`, { timeout: 5000 });
                this.cachedPrices = response.data;
                this.lastFetchTime = Date.now();
                return this.cachedPrices;
            }
            catch (error) {
                const axiosError = error;
                console.error('Price fetch failed:', axiosError.message);
                return this.cachedPrices; // Fallback to cached data
            }
        });
    }
    static calculateBalanceData(balances, prices) {
        let totalAvailableUSD = 0;
        let totalPendingUSD = 0;
        Object.entries(balances)
            .forEach(([coin, balance]) => {
            var _a;
            const cgId = symbolToIdMap[coin];
            const price = cgId ? (_a = prices[cgId]) === null || _a === void 0 ? void 0 : _a.usd : 0;
            if (price) {
                totalAvailableUSD += balance.available * price;
                totalPendingUSD += balance.pending * price;
            }
        });
        return {
            totalAvailableUSD: totalAvailableUSD.toFixed(2),
            totalPendingUSD: totalPendingUSD.toFixed(2),
            lastUpdated: new Date().toISOString()
        };
    }
    static sendToClient(userId, event, data) {
        const client = this.clients.get(userId);
        if (client && !client.writableEnded) {
            try {
                client.write(`event: ${event}\n`);
                client.write(`data: ${JSON.stringify(data)}\n\n`);
            }
            catch (error) {
                console.error(`Error writing to client ${userId}:`, error);
                this.removeClient(userId);
            }
        }
    }
    static removeClient(userId) {
        const client = this.clients.get(userId);
        if (client) {
            try {
                if (!client.writableEnded) {
                    client.end();
                }
            }
            catch (error) {
                console.error(`Error closing connection for ${userId}:`, error);
            }
            this.clients.delete(userId);
        }
    }
    static notifyAll() {
        return __awaiter(this, void 0, void 0, function* () {
            const updates = Array.from(this.clients.keys())
                .map(userId => this.sendBalanceUpdate(userId));
            yield Promise.all(updates);
        });
    }
    static closeAll() {
        this.clients.forEach((_, userId) => this.removeClient(userId));
    }
    static sendTransactionNotification(userId, type, data) {
        return __awaiter(this, void 0, void 0, function* () {
            this.sendToClient(userId, 'transaction_notification', Object.assign(Object.assign({ type }, data), { timestamp: new Date().toISOString() }));
        });
    }
}
exports.SSEService = SSEService;
SSEService.clients = new Map();
SSEService.cachedPrices = {};
SSEService.lastFetchTime = 0;
SSEService.CACHE_DURATION = 2 * 60 * 1000; // 2 minutes
