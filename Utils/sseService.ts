// utils/sseService.ts
import { Response } from 'express';
import { User } from '../model/userModel';
import axios, { AxiosError } from 'axios';

// Type definitions
type CryptoSymbol = 'btc' | 'eth' | 'link' | 'bnb' | 'usdt' | 'usdc';
type Balance = { available: number; pending: number };
type UserBalances = Record<CryptoSymbol, Balance>;
type PriceData = Record<string, { usd: number }>;

const symbolToIdMap: Record<CryptoSymbol, string> = {
  btc: "bitcoin",
  eth: "ethereum",
  link: "chainlink",
  bnb: "binancecoin",
  usdt: "tether",
  usdc: "usd-coin",
};

export class SSEService {
  private static clients = new Map<string, Response>();
  private static cachedPrices: PriceData = {};
  private static lastFetchTime = 0;
  private static readonly CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

  static async addClient(userId: string, res: Response): Promise<void> {
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
      await this.sendBalanceUpdate(userId);

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

    } catch (error) {
      console.error(`Error adding client ${userId}:`, error);
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  }

  static async sendBalanceUpdate(userId: string): Promise<void> {
    try {
      const user = await User.findById(userId).lean().exec();
      if (!user) {
        console.warn(`User ${userId} not found`);
        return;
      }

      const balances = user.balances as UserBalances;
      const coinIds = this.getValidCoinIds(balances);
      if (coinIds.length === 0) return;

      const prices = await this.getPrices(coinIds);
      const balanceData = this.calculateBalanceData(balances, prices);

      this.sendToClient(userId, 'balance_update', balanceData);
    } catch (error) {
      console.error(`Error updating balance for ${userId}:`, error);
    }
  }

  private static getValidCoinIds(balances: UserBalances): string[] {
    return (Object.keys(balances) as CryptoSymbol[])
      .map(key => symbolToIdMap[key])
      .filter(Boolean);
  }

  private static async getPrices(coinIds: string[]): Promise<PriceData> {
    if (Date.now() - this.lastFetchTime < this.CACHE_DURATION) {
      return this.cachedPrices;
    }

    try {
      const response = await axios.get<PriceData>(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd`,
        { timeout: 5000 }
      );
      
      this.cachedPrices = response.data;
      this.lastFetchTime = Date.now();
      return this.cachedPrices;
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('Price fetch failed:', axiosError.message);
      return this.cachedPrices; // Fallback to cached data
    }
  }

  private static calculateBalanceData(balances: UserBalances, prices: PriceData) {
    let totalAvailableUSD = 0;
    let totalPendingUSD = 0;

    (Object.entries(balances) as [CryptoSymbol, Balance][])
      .forEach(([coin, balance]) => {
        const cgId = symbolToIdMap[coin];
        const price = cgId ? prices[cgId]?.usd : 0;
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

  private static sendToClient(userId: string, event: string, data: unknown): void {
    const client = this.clients.get(userId);
    if (client && !client.writableEnded) {
      try {
        client.write(`event: ${event}\n`);
        client.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (error) {
        console.error(`Error writing to client ${userId}:`, error);
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

  static async notifyAll(): Promise<void> {
    const updates = Array.from(this.clients.keys())
      .map(userId => this.sendBalanceUpdate(userId));
    await Promise.all(updates);
  }

  static closeAll(): void {
    this.clients.forEach((_, userId) => this.removeClient(userId));
  }
}