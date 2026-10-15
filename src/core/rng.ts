// Seeded RNG (mulberry32) — all gameplay randomness flows through this for determinism.
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 1;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  angle(): number {
    return this.next() * Math.PI * 2;
  }
  // weighted pick: entries of [weight, value]
  weighted<T>(entries: readonly (readonly [number, T])[]): T {
    let total = 0;
    for (const e of entries) total += e[0];
    let r = this.next() * total;
    for (const e of entries) {
      r -= e[0];
      if (r <= 0) return e[1];
    }
    return entries[entries.length - 1][1];
  }
}
