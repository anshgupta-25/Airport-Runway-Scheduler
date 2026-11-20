/**
 * MinHeap — an *indexed* binary min-heap (priority queue).
 *
 * The heap is stored in a plain array:
 *     parent(i) = (i - 1) / 2      left(i) = 2i + 1      right(i) = 2i + 2
 *
 * "Indexed" means we also keep a hash map  key -> array index.
 * That lets us find any item in O(1) and change its priority in O(log n),
 * which a normal heap cannot do.
 *
 *   Operation        Time
 *   ---------------  ---------
 *   peek             O(1)
 *   insert           O(log n)
 *   extractMin       O(log n)
 *   update(key)      O(log n)
 *   remove(key)      O(log n)
 *   buildFrom(list)  O(n)      (bottom-up heapify)
 *
 * Every public operation records its steps in `this.trace`, so the UI can
 * replay the sift-up / sift-down swaps as an animation.
 */
class MinHeap {
  /**
   * @param {(a, b) => number} compare  negative if `a` must come before `b`
   * @param {(item) => string} getKey   unique key of an item
   */
  constructor(compare, getKey) {
    this.items = [];
    this.positions = new Map(); // key -> index in this.items
    this.compare = compare;
    this.getKey = getKey;
    this.trace = [];
  }

  // ---------- basic queries ----------

  get size() {
    return this.items.length;
  }

  isEmpty() {
    return this.items.length === 0;
  }

  peek() {
    return this.items[0] ?? null;
  }

  has(key) {
    return this.positions.has(key);
  }

  /** Array copy in heap order (index 0 is the root). */
  toArray() {
    return [...this.items];
  }

  // ---------- operations ----------

  insert(item) {
    this.trace = [];
    const index = this.items.length;
    this.items.push(item);
    this.positions.set(this.getKey(item), index);
    this.record("insert", [index], `Insert ${this.getKey(item)} at the end (index ${index})`);

    this.siftUp(index);
    this.record("done", [], `${this.getKey(item)} is in place`);
  }

  extractMin() {
    this.trace = [];
    if (this.isEmpty()) return null;

    const top = this.items[0];
    this.record("extract", [0], `Remove root ${this.getKey(top)} (highest priority)`);

    const last = this.items.pop();
    this.positions.delete(this.getKey(top));

    if (this.items.length > 0) {
      this.items[0] = last;
      this.positions.set(this.getKey(last), 0);
      this.record("move", [0], `Move last item ${this.getKey(last)} to the root`);
      this.siftDown(0);
    }

    this.record("done", [], "Heap order restored");
    return top;
  }

  /** Call after the priority of an item has changed. */
  update(key) {
    this.trace = [];
    const index = this.positions.get(key);
    if (index === undefined) return;

    this.record("update", [index], `Priority of ${key} changed`);
    // The item moves either up or down — never both. Trying both is simplest.
    this.siftUp(index);
    this.siftDown(this.positions.get(key));
    this.record("done", [], `${key} is in place`);
  }

  remove(key) {
    this.trace = [];
    const index = this.positions.get(key);
    if (index === undefined) return null;

    const removed = this.items[index];
    const lastIndex = this.items.length - 1;
    this.record("extract", [index], `Remove ${key}`);

    if (index !== lastIndex) this.swap(index, lastIndex);
    this.items.pop();
    this.positions.delete(key);

    // The old last item now sits at `index`; it may need to go up or down.
    if (index < this.items.length) {
      const movedKey = this.getKey(this.items[index]);
      this.siftUp(index);
      this.siftDown(this.positions.get(movedKey));
    }

    this.record("done", [], "Heap order restored");
    return removed;
  }

  /** Replace the whole heap in O(n) using bottom-up heapify. */
  buildFrom(list) {
    this.trace = [];
    this.items = [...list];
    this.positions = new Map(this.items.map((item, i) => [this.getKey(item), i]));

    // Leaves are already heaps, so start from the last parent and go up.
    for (let i = Math.floor(this.items.length / 2) - 1; i >= 0; i--) {
      this.siftDown(i);
    }
    this.trace = []; // too many steps to animate; keep only the result
  }

  clear() {
    this.items = [];
    this.positions.clear();
    this.trace = [];
  }

  // ---------- internal helpers ----------

  /** Move item at `index` up while it is smaller than its parent. */
  siftUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      this.record("compare", [index, parent], this.describeCompare(index, parent));

      if (this.compare(this.items[index], this.items[parent]) >= 0) break;

      this.swap(index, parent);
      index = parent;
    }
  }

  /** Move item at `index` down while a child is smaller than it. */
  siftDown(index) {
    const n = this.items.length;

    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;

      if (left < n && this.compare(this.items[left], this.items[smallest]) < 0) smallest = left;
      if (right < n && this.compare(this.items[right], this.items[smallest]) < 0) smallest = right;

      if (smallest === index) break;

      this.record("compare", [index, smallest], this.describeCompare(smallest, index));
      this.swap(index, smallest);
      index = smallest;
    }
  }

  swap(i, j) {
    const a = this.items[i];
    const b = this.items[j];
    this.items[i] = b;
    this.items[j] = a;
    this.positions.set(this.getKey(b), i);
    this.positions.set(this.getKey(a), j);
    this.record("swap", [i, j], `Swap ${this.getKey(b)} ↔ ${this.getKey(a)}`);
  }

  describeCompare(child, parent) {
    const c = this.getKey(this.items[child]);
    const p = this.getKey(this.items[parent]);
    return `Compare ${c} with parent ${p}`;
  }

  /** Save a snapshot of the heap so the UI can replay this step. */
  record(type, indices, message) {
    this.trace.push({
      type,
      indices,
      message,
      keys: this.items.map(this.getKey),
    });
  }
}
