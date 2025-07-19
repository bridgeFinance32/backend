import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { User } from "./model/userModel";
import axios from "axios";
import eventBus from './Utils/eventBus';
import { EventEmitter } from 'events';

interface Balance {
    available: number;
    pending: number;
}

interface UserBalances {
    [key: string]: Balance;
}

interface PriceData {
    [key: string]: {
        usd: number;
    };
}

interface WebSocketMessage {
    type: 'balance_update' | 'error' | 'transactionNotification';
    data: any;
}

// Crypto symbol mappings
const symbolToIdMap: Record<string, string> = {
    btc: "bitcoin",
    eth: "ethereum",
    link: "chainlink",
    bnb: "binancecoin",
    usdt: "tether",
    usdc: "usd-coin",
};

// Cache and connection tracking
let cachedPrices: Record<string, number> = {};
let lastFetchTime: number = 0;
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes
const connectedClients = new Map<string, WebSocket[]>();
const balanceUpdateEmitter = new EventEmitter();

// Transaction event listener
eventBus.on('transactionCreated', (transaction) => {
    const receiverId = transaction.receiver?.toString?.() || transaction.receiver;
    const wsList = connectedClients.get(receiverId);
    if (wsList && wsList.length > 0) {
        wsList.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'transactionNotification',
                    data: transaction
                }));
            }
        });
    }
});

// Helper functions
const fetchPricesFromCoinGecko = async (coinIds: string[]): Promise<Record<string, number>> => {
    const idsParam = coinIds.join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`;

    try {
        const response = await axios.get<PriceData>(url);
        const prices: Record<string, number> = {};

        for (const id of coinIds) {
            if (!response.data[id]?.usd) {
                throw new Error(`Missing price data for ${id}`);
            }
            prices[id] = response.data[id].usd;
        }

        cachedPrices = prices;
        lastFetchTime = Date.now();
        balanceUpdateEmitter.emit('prices_updated');
        return prices;
    } catch (error) {
        console.error("CoinGecko fetch failed:", error);
        throw error;
    }
};

const sendToClient = (ws: WebSocket, message: WebSocketMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
};

const processUserBalances = async (userId: string): Promise<WebSocketMessage | null> => {
    const user = await User.findById(userId);
    if (!user) return null;

    const balances = user.balances || {};
    const coinIds = Object.keys(balances)
        .map(key => symbolToIdMap[key.toLowerCase()])
        .filter(Boolean) as string[];

    if (coinIds.length === 0) return null;

    const prices = Date.now() - lastFetchTime < CACHE_DURATION
        ? cachedPrices
        : await fetchPricesFromCoinGecko(coinIds);

    let totalAvailableUSD = 0;
    let totalPendingUSD = 0;

    for (const [coin, balance] of Object.entries(balances)) {
        const cgId = symbolToIdMap[coin.toLowerCase()];
        if (!cgId || !prices[cgId]) continue;

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
};

const updateUserClients = async (userId: string) => {
    try {
        const message = await processUserBalances(userId);
        if (!message) return;

        const clients = connectedClients.get(userId) || [];
        clients.forEach(client => {
            sendToClient(client, message);
        });
    } catch (error) {
        console.error(`Error updating clients for user ${userId}:`, error);
    }
};

// Main WebSocket server creation
export const createWebSocketServer = () => {
    console.log('[WebSocket] Initializing server...');
    const wss = new WebSocketServer({port: 8080});

    // Setup event listeners
    balanceUpdateEmitter.on('balances_changed', updateUserClients);
    balanceUpdateEmitter.on('prices_updated', () => {
        connectedClients.forEach((_, userId) => updateUserClients(userId));
    });

    // Connection handler
    wss.on('connection', (ws: WebSocket, req) => {
        const clientIp = req.socket.remoteAddress;
        const url = new URL(req.url || '', `http://${req.headers.host}`);
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
        connectedClients.get(userId)?.push(ws);

        console.log(`[WebSocket] New connection from ${clientIp}, user: ${userId}`);

        // Send initial data
        updateUserClients(userId);

        // Cleanup handlers
        ws.on('close', () => {
            const remaining = (connectedClients.get(userId) || [])
                .filter(client => client !== ws);
            
            if (remaining.length > 0) {
                connectedClients.set(userId, remaining);
            } else {
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
        handleUpgrade: (req: any, socket: any, head: Buffer) => {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit('connection', ws, req);
            });
        }
    };
};