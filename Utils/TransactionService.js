"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class TransactionEventService {
    static addClient(userId, res) {
        // Set SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        // Store connection
        this.clients.set(userId, res);
        // Send initial connection confirmation with proper typing
        this.sendEvent(userId, {
            type: 'connection',
            status: 'connected',
            amount: 0,
            currency: '',
            timestamp: new Date().toISOString()
        });
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
    static sendTransactionEvent(userId, event) {
        const fullEvent = Object.assign(Object.assign({}, event), { timestamp: new Date().toISOString() });
        this.sendEvent(userId, fullEvent);
    }
    static sendEvent(userId, event) {
        const client = this.clients.get(userId);
        if (client && !client.writableEnded) {
            try {
                client.write(`event: ${event.type}\n`);
                client.write(`data: ${JSON.stringify(event)}\n\n`);
            }
            catch (error) {
                console.error(`Error sending event to ${userId}:`, error);
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
}
TransactionEventService.clients = new Map();
exports.default = TransactionEventService;
