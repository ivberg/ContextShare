export interface LruOptions { max: number; ttlMs?: number; }
interface Entry<V>{ value: V; ts: number; }

export class LruCache<K,V>{
  private map = new Map<K, Entry<V>>();
  private order: K[] = [];
  constructor(private opts: LruOptions){ }

  set(key: K, value: V): void {
    const now = Date.now();
    if(this.map.has(key)){
      this._touch(key);
      this.map.set(key, { value, ts: now });
    } else {
      this.map.set(key, { value, ts: now });
      this.order.push(key);
    }
    this._evict();
  }

  get(key: K): V | undefined {
    const e = this.map.get(key);
    if(!e) {return undefined;}
    if(this.opts.ttlMs && (Date.now() - e.ts) > this.opts.ttlMs){
      this.delete(key);
      return undefined;
    }
    this._touch(key);
    return e.value;
  }

  delete(key: K): void {
    if(this.map.delete(key)){
      this.order = this.order.filter(k => k !== key);
    }
  }

  private _touch(key: K): void {
    this.order = this.order.filter(k => k !== key);
    this.order.push(key);
  }

  private _evict(): void {
    while(this.order.length > this.opts.max){
      const k = this.order.shift();
      if(k !== undefined) {this.map.delete(k);}
    }
  }
}
