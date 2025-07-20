// lib/sse/transactionEventService.ts
import { Response } from 'express';

// Define separate types for transaction events and connection events
type TransactionType = 'deposit' | 'withdrawal' | 'transfer' | 'swap';
type ConnectionType = 'connection';

type TransactionStatus = 'pending' | 'completed' | 'failed';
type ConnectionStatus = 'connected';

// Base event structure
interface BaseEvent {
  amount: number;
  currency: string;
  timestamp: string;
}

// Transaction-specific event
interface TransactionEvent extends BaseEvent {
  type: TransactionType;
  status: TransactionStatus;
  txHash?: string;
  fromAddress?: string;
  toAddress?: string;
}

// Connection-specific event
interface ConnectionEvent extends BaseEvent {
  type: ConnectionType;
  status: ConnectionStatus;
}

// Combined type for all possible events
type SSEEvent = TransactionEvent | ConnectionEvent;

class TransactionEventService {
  private static clients = new Map<string, Response>();

  static addClient(userId: string, res: Response): void {
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
    } as ConnectionEvent);

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      if (this.clients.has(userId)) {
        res.write(': heartbeat\n\n');
      } else {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Handle cleanup
    res.on('close', () => {
      clearInterval(heartbeat);
      this.removeClient(userId);
    });
  }

  static sendTransactionEvent(
    userId: string,
    event: Omit<TransactionEvent, 'timestamp'>
  ): void {
    const fullEvent: TransactionEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };
    this.sendEvent(userId, fullEvent);
  }

  private static sendEvent(userId: string, event: SSEEvent): void {
    const client = this.clients.get(userId);
    if (client && !client.writableEnded) {
      try {
        client.write(`event: ${event.type}\n`);
        client.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (error) {
        console.error(`Error sending event to ${userId}:`, error);
        this.removeClient(userId);
      }
    }
  }

  static removeClient(userId: string): void {
    const client = this.clients.get(userId);
    if (client) {
      try {
        if (!client.writableEnded) {
          client.end();
        }
      } catch (error) {
        console.error(`Error closing connection for ${userId}:`, error);
      }
      this.clients.delete(userId);
    }
  }
}

export default TransactionEventService;