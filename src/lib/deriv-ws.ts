'use client';

export interface ActiveSymbol {
  symbol: string;
  underlying_symbol: string;
  display_name: string;
  underlying_symbol_name: string;
  market: string;
  market_display_name: string;
  submarket: string;
  submarket_display_name: string;
  pip_size: number;
}

export interface Tick {
  epoch: number;
  quote: number;
  symbol: string;
  id: string;
}

export class DerivWSClient {
  private ws: WebSocket | null = null;
  private reqId = 1;
  private pending = new Map<number, { resolve: (data: any) => void; reject: (err: any) => void }>();
  private subs = new Map<string, (data: any) => void>();
  private globalHandlers: ((data: any) => void)[] = [];
  private url: string;
  public isConnected = false;

  constructor(appId = '1089') {
    const endpoint = process.env.NEXT_PUBLIC_DERIV_ENV === 'production' ? 'green' : 'blue';
    this.url = `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;
  }

  connect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.isConnected = true;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          for (const h of this.globalHandlers) h(data);

          const reqId = data.req_id;
          if (reqId && this.pending.has(reqId)) {
            const p = this.pending.get(reqId)!;
            this.pending.delete(reqId);
            if (data.error) p.reject(new Error(data.error.message));
            else p.resolve(data);
          }

          const subId = data.subscription?.id;
          if (subId && this.subs.has(subId)) {
            this.subs.get(subId)!(data);
          }
        } catch (e) {
          console.error('WS message parse error', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };
    });
  }

  send<T = any>(payload: Record<string, any>): Promise<T> {
    return new Promise(async (resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        await this.connect();
      }
      const id = this.reqId++;
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ ...payload, req_id: id }));
    });
  }

  async subscribe(payload: Record<string, any>, handler: (data: any) => void): Promise<() => void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    const id = this.reqId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (data) => {
          const subId = data.subscription?.id;
          if (subId) {
            this.subs.set(subId, handler);
            handler(data);
            resolve(() => {
              this.subs.delete(subId);
              this.send({ forget: subId }).catch(() => {});
            });
          } else {
            handler(data);
            resolve(() => {});
          }
        },
        reject,
      });
      this.ws!.send(JSON.stringify({ ...payload, subscribe: 1, req_id: id }));
    });
  }

  onMessage(handler: (data: any) => void) {
    this.globalHandlers.push(handler);
    return () => {
      this.globalHandlers = this.globalHandlers.filter((h) => h !== handler);
    };
  }
}
