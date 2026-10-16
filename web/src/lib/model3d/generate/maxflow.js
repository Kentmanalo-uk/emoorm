/*
 * Boykov–Kolmogorov max-flow / min-cut ("An Experimental Comparison of
 * Min-Cut/Max-Flow Algorithms for Energy Minimization in Vision", 2004),
 * after the structure of their maxflow-v3 library: two search trees grown
 * from the source and the sink, augmenting along the path where they meet,
 * then adopting the orphans. Typed arrays throughout.
 *
 *   const g = new Graph(nodes, edges);
 *   g.addTWeights(i, costIfSink, costIfSource);  // capacities to S and to T
 *   g.addEdge(i, j, cap, revCap);
 *   g.maxflow();
 *   g.isSource(i)                                // after the cut
 */

const TERMINAL = -2;
const ORPHAN = -3;
const NONE = -1;

export class Graph {
  constructor(nodeCount, edgeEstimate = nodeCount * 4) {
    this.n = nodeCount;
    this.trCap = new Float64Array(nodeCount);
    this.first = new Int32Array(nodeCount).fill(NONE);
    this.parent = new Int32Array(nodeCount).fill(NONE);
    this.nextActive = new Int32Array(nodeCount).fill(NONE);
    this.isSink = new Uint8Array(nodeCount);
    this.ts = new Int32Array(nodeCount);
    this.dist = new Int32Array(nodeCount);
    const arcs = Math.max(2, edgeEstimate * 2);
    this.head = new Int32Array(arcs);
    this.next = new Int32Array(arcs);
    this.rCap = new Float64Array(arcs);
    this.arcCount = 0;
    this.flow = 0;
  }

  growArcs() {
    const size = this.head.length * 2;
    for (const k of ['head', 'next', 'rCap']) {
      const g = new this[k].constructor(size);
      g.set(this[k]);
      this[k] = g;
    }
  }

  /** Capacities from the source (paid if i ends on the sink side) and to the sink. */
  addTWeights(i, capSource, capSink) {
    const delta = this.trCap[i];
    if (delta > 0) capSource += delta; else capSink -= delta;
    this.flow += Math.min(capSource, capSink);
    this.trCap[i] = capSource - capSink;
  }

  addEdge(i, j, cap, revCap) {
    if (this.arcCount + 2 > this.head.length) this.growArcs();
    const a = this.arcCount;
    const b = a + 1;
    this.arcCount += 2;
    this.head[a] = j; this.next[a] = this.first[i]; this.first[i] = a; this.rCap[a] = cap;
    this.head[b] = i; this.next[b] = this.first[j]; this.first[j] = b; this.rCap[b] = revCap;
  }

  isSource(i) {
    return !(this.parent[i] !== NONE && this.isSink[i]);
  }

  maxflow() {
    const {
      n, trCap, first, parent, nextActive, isSink, ts, dist, head, next, rCap,
    } = this;
    let qFirst = NONE;
    let qLast = NONE;
    const setActive = (i) => {
      if (nextActive[i] !== NONE) return;
      if (qLast === NONE) qFirst = i; else nextActive[qLast] = i;
      qLast = i;
      nextActive[i] = i; // the end of the queue points at itself
    };
    const nextActiveNode = () => {
      for (;;) {
        const i = qFirst;
        if (i === NONE) return NONE;
        if (nextActive[i] === i) { qFirst = NONE; qLast = NONE; } else qFirst = nextActive[i];
        nextActive[i] = NONE;
        if (parent[i] !== NONE) return i;
      }
    };
    // Orphans, processed in order (the order affects speed only, not the cut).
    let orphans = [];
    let orphanHead = 0;
    const orphanFront = (i) => { parent[i] = ORPHAN; orphans.push(i); };
    const orphanRear = orphanFront;

    let TIME = 0;
    for (let i = 0; i < n; i += 1) {
      nextActive[i] = NONE;
      ts[i] = 0;
      if (trCap[i] > 0) { isSink[i] = 0; parent[i] = TERMINAL; setActive(i); dist[i] = 1; } else if (trCap[i] < 0) { isSink[i] = 1; parent[i] = TERMINAL; setActive(i); dist[i] = 1; } else parent[i] = NONE;
    }

    const augment = (middle) => {
      let bottleneck = rCap[middle];
      let i;
      for (i = head[middle ^ 1]; ; ) {
        const a = parent[i];
        if (a === TERMINAL) break;
        if (bottleneck > rCap[a ^ 1]) bottleneck = rCap[a ^ 1];
        i = head[a];
      }
      if (bottleneck > trCap[i]) bottleneck = trCap[i];
      for (i = head[middle]; ; ) {
        const a = parent[i];
        if (a === TERMINAL) break;
        if (bottleneck > rCap[a]) bottleneck = rCap[a];
        i = head[a];
      }
      if (bottleneck > -trCap[i]) bottleneck = -trCap[i];

      rCap[middle ^ 1] += bottleneck;
      rCap[middle] -= bottleneck;
      for (i = head[middle ^ 1]; ; ) {
        const a = parent[i];
        if (a === TERMINAL) break;
        rCap[a] += bottleneck;
        rCap[a ^ 1] -= bottleneck;
        if (!rCap[a ^ 1]) orphanFront(i);
        i = head[a];
      }
      trCap[i] -= bottleneck;
      if (!trCap[i]) orphanFront(i);
      for (i = head[middle]; ; ) {
        const a = parent[i];
        if (a === TERMINAL) break;
        rCap[a ^ 1] += bottleneck;
        rCap[a] -= bottleneck;
        if (!rCap[a]) orphanFront(i);
        i = head[a];
      }
      trCap[i] += bottleneck;
      if (!trCap[i]) orphanFront(i);
      this.flow += bottleneck;
    };

    const INF_D = 1 << 30;
    const processOrphan = (i, sinkTree) => {
      let dMin = INF_D;
      let a0Min = NONE;
      for (let a0 = first[i]; a0 !== NONE; a0 = next[a0]) {
        const cap = sinkTree ? rCap[a0] : rCap[a0 ^ 1];
        if (!cap) continue;
        let j = head[a0];
        if ((isSink[j] ? 1 : 0) !== (sinkTree ? 1 : 0)) continue;
        let a = parent[j];
        if (a === NONE) continue;
        // How far is j from the terminal (and is it rooted there)?
        let d = 0;
        for (;;) {
          if (ts[j] === TIME) { d += dist[j]; break; }
          a = parent[j];
          d += 1;
          if (a === TERMINAL) { ts[j] = TIME; dist[j] = 1; break; }
          if (a === ORPHAN) { d = INF_D; break; }
          j = head[a];
        }
        if (d < INF_D) {
          if (d < dMin) { a0Min = a0; dMin = d; }
          for (j = head[a0]; ts[j] !== TIME; j = head[parent[j]]) { ts[j] = TIME; dist[j] = d; d -= 1; }
        }
      }
      parent[i] = a0Min;
      if (a0Min !== NONE) {
        ts[i] = TIME;
        dist[i] = dMin + 1;
        return;
      }
      // No new parent: i becomes free; its children become orphans.
      for (let a0 = first[i]; a0 !== NONE; a0 = next[a0]) {
        const j = head[a0];
        if ((isSink[j] ? 1 : 0) !== (sinkTree ? 1 : 0)) continue;
        const a = parent[j];
        if (a === NONE) continue;
        const cap = sinkTree ? rCap[a0] : rCap[a0 ^ 1];
        if (cap) setActive(j);
        if (a !== TERMINAL && a !== ORPHAN && head[a] === i) orphanRear(j);
      }
    };

    let current = NONE;
    for (;;) {
      let i = current;
      if (i !== NONE) {
        nextActive[i] = NONE;
        if (parent[i] === NONE) i = NONE;
      }
      if (i === NONE) {
        i = nextActiveNode();
        if (i === NONE) break;
      }
      let found = NONE;
      if (!isSink[i]) {
        for (let a = first[i]; a !== NONE; a = next[a]) {
          if (!rCap[a]) continue;
          const j = head[a];
          if (parent[j] === NONE) {
            isSink[j] = 0; parent[j] = a ^ 1; ts[j] = ts[i]; dist[j] = dist[i] + 1; setActive(j);
          } else if (isSink[j]) { found = a; break; } else if (ts[j] <= ts[i] && dist[j] > dist[i]) {
            parent[j] = a ^ 1; ts[j] = ts[i]; dist[j] = dist[i] + 1;
          }
        }
      } else {
        for (let a = first[i]; a !== NONE; a = next[a]) {
          if (!rCap[a ^ 1]) continue;
          const j = head[a];
          if (parent[j] === NONE) {
            isSink[j] = 1; parent[j] = a ^ 1; ts[j] = ts[i]; dist[j] = dist[i] + 1; setActive(j);
          } else if (!isSink[j]) { found = a ^ 1; break; } else if (ts[j] <= ts[i] && dist[j] > dist[i]) {
            parent[j] = a ^ 1; ts[j] = ts[i]; dist[j] = dist[i] + 1;
          }
        }
      }
      TIME += 1;
      if (found !== NONE) {
        nextActive[i] = i; // keep working on i next
        current = i;
        augment(found);
        while (orphanHead < orphans.length) {
          const o = orphans[orphanHead];
          orphanHead += 1;
          processOrphan(o, !!isSink[o]);
          if (orphanHead > 4096) { orphans = orphans.slice(orphanHead); orphanHead = 0; }
        }
        orphans = [];
        orphanHead = 0;
      } else current = NONE;
    }
    return this.flow;
  }
}
