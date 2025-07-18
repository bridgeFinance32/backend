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
exports.createWebSocketServer = void 0;
const ws_1 = require("ws");
const url_1 = require("url");
const userModel_1 = require("./model/userModel");
const axios_1 = __importDefault(require("axios"));
const eventBus_1 = __importDefault(require("./Utils/eventBus"));
const events_1 = require("events");
// Crypto symbol mappings
const symbolToIdMap = {
    btc: "bitcoin",
    eth: "ethereum",
    link: "chainlink",
    bnb: "binancecoin",
    usdt: "tether",
    usdc: "usd-coin",
};
// Cache and connection tracking
let cachedPrices = {};
let lastFetchTime = 0;
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes
const connectedClients = new Map();
const balanceUpdateEmitter = new events_1.EventEmitter();
// Transaction event listener
eventBus_1.default.on('transactionCreated', (transaction) => {
    var _a, _b;
    const receiverId = ((_b = (_a = transaction.receiver) === null || _a === void 0 ? void 0 : _a.toString) === null || _b === void 0 ? void 0 : _b.call(_a)) || transaction.receiver;
    const wsList = connectedClients.get(receiverId);
    if (wsList && wsList.length > 0) {
        wsList.forEach(ws => {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'transactionNotification',
                    data: transaction
                }));
            }
        });
    }
});
// Helper functions
const fetchPricesFromCoinGecko = (coinIds) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const idsParam = coinIds.join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`;
    try {
        const response = yield axios_1.default.get(url);
        const prices = {};
        for (const id of coinIds) {
            if (!((_a = response.data[id]) === null || _a === void 0 ? void 0 : _a.usd)) {
                throw new Error(`Missing price data for ${id}`);
            }
            prices[id] = response.data[id].usd;
        }
        cachedPrices = prices;
        lastFetchTime = Date.now();
        balanceUpdateEmitter.emit('prices_updated');
        return prices;
    }
    catch (error) {
        console.error("CoinGecko fetch failed:", error);
        throw error;
    }
});
const sendToClient = (ws, message) => {
    if (ws.readyState === ws_1.WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
};
const processUserBalances = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield userModel_1.User.findById(userId);
    if (!user)
        return null;
    const balances = user.balances || {};
    const coinIds = Object.keys(balances)
        .map(key => symbolToIdMap[key.toLowerCase()])
        .filter(Boolean);
    if (coinIds.length === 0)
        return null;
    const prices = Date.now() - lastFetchTime < CACHE_DURATION
        ? cachedPrices
        : yield fetchPricesFromCoinGecko(coinIds);
    let totalAvailableUSD = 0;
    let totalPendingUSD = 0;
    for (const [coin, balance] of Object.entries(balances)) {
        const cgId = symbolToIdMap[coin.toLowerCase()];
        if (!cgId || !prices[cgId])
            continue;
        const price = prices[cgId];
        totalAvailableUSD += balance.available * price;
        totalPendingUSD += balance.pending * price;
    }
    return {
        type: 'balance_update',
        data: {
            totals: {
                available: totalAvailableUSD.toFixed(2),
                pending: totalPendingUSD.toFixed(2)
            },
            lastUpdated: new Date().toISOString()
        }
    };
});
const updateUserClients = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const message = yield processUserBalances(userId);
        if (!message)
            return;
        const clients = connectedClients.get(userId) || [];
        clients.forEach(client => {
            sendToClient(client, message);
        });
    }
    catch (error) {
        console.error(`Error updating clients for user ${userId}:`, error);
    }
});
// Main WebSocket server creation
const createWebSocketServer = () => {
    console.log('[WebSocket] Initializing server...');
    const wss = new ws_1.WebSocketServer({ port: 8080 });
    // Setup event listeners
    balanceUpdateEmitter.on('balances_changed', updateUserClients);
    balanceUpdateEmitter.on('prices_updated', () => {
        connectedClients.forEach((_, userId) => updateUserClients(userId));
    });
    // Connection handler
    wss.on('connection', (ws, req) => {
        var _a;
        const clientIp = req.socket.remoteAddress;
        const url = new url_1.URL(req.url || '', `http://${req.headers.host}`);
        const userId = url.searchParams.get('userId');
        if (!userId) {
            console.log(`[WebSocket] Closing connection from ${clientIp} - missing userId`);
            ws.close(4001, 'User ID required');
            return;
        }
        // Add to connected clients
        if (!connectedClients.has(userId)) {
            connectedClients.set(userId, []);
        }
        (_a = connectedClients.get(userId)) === null || _a === void 0 ? void 0 : _a.push(ws);
        console.log(`[WebSocket] New connection from ${clientIp}, user: ${userId}`);
        // Send initial data
        updateUserClients(userId);
        // Cleanup handlers
        ws.on('close', () => {
            const remaining = (connectedClients.get(userId) || [])
                .filter(client => client !== ws);
            if (remaining.length > 0) {
                connectedClients.set(userId, remaining);
            }
            else {
                connectedClients.delete(userId);
            }
            console.log(`[WebSocket] User ${userId} disconnected`);
        });
        ws.on('error', (error) => {
            console.error(`[WebSocket] Error for user ${userId}:`, error);
        });
    });
    // Return both server and upgrade handler
    return {
        wss,
        handleUpgrade: (req, socket, head) => {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit('connection', ws, req);
            });
        }
    };
};
exports.createWebSocketServer = createWebSocketServer;
