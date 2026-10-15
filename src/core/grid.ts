// Uniform spatial hash for broad-phase queries (enemies).
export class SpatialGrid<T extends { x: number; y: number }> {
  private cell: number;
  private map = new Map<number, T[]>();
  private buckets: T[][] = [];
  private bucketCount = 0;

  constructor(cellSize = 48) {
    this.cell = cellSize;
  }

  clear() {
    // recycle buckets to avoid GC churn
    for (const arr of this.map.values()) {
      arr.length = 0;
      this.buckets.push(arr);
    }
    this.map.clear();
  }

  private key(cx: number, cy: number): number {
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  insert(e: T) {
    const cx = Math.floor(e.x / this.cell);
    const cy = Math.floor(e.y / this.cell);
    const k = this.key(cx, cy);
    let arr = this.map.get(k);
    if (!arr) {
      arr = this.buckets.pop() ?? [];
      this.map.set(k, arr);
    }
    arr.push(e);
  }

  // visit all entries in cells overlapping circle (x,y,r)
  query(x: number, y: number, r: number, cb: (e: T) => void) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c);
    const y1 = Math.floor((y + r) / c);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.map.get(this.key(cx, cy));
        if (arr) for (let i = 0; i < arr.length; i++) cb(arr[i]);
      }
    }
  }

  forEachNeighborOf(e: T, r: number, cb: (o: T) => void) {
    this.query(e.x, e.y, r, cb);
  }
}
