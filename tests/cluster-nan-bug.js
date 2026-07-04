// Test: clusterLevels NaN bug and tolerance edge case

function clusterLevels(points, totalLen, tolerance = 0.04) {
  const clusters = [];
  for (const pt of [...points].sort((a, b) => a.price - b.price)) {
    const c = clusters.find(c => Math.abs(c.price - pt.price) / c.price < tolerance);
    if (c) {
      c.price = (c.price * c.touches + pt.price) / (c.touches + 1);
      c.touches++;
      if (pt.idx > c.lastIdx) c.lastIdx = pt.idx;
    } else {
      clusters.push({ price: pt.price, touches: 1, lastIdx: pt.idx });
    }
  }
  return clusters
    .map(c => ({ ...c, score: c.touches + c.lastIdx / totalLen }))
    .sort((a, b) => b.score - a.score);
}

console.log("=== clusterLevels NaN Bug ===");

// Test 1: Price = 0 -> division by zero
const zeroPoints = [
  { price: 0, idx: 5 },
  { price: 0, idx: 10 },
  { price: 0, idx: 15 },
];
const zeroClusters = clusterLevels(zeroPoints, 20, 0.04);
console.log("Price=0 points:", zeroPoints.length);
console.log("Clusters created:", zeroClusters.length);
console.log("Expected: 1 cluster with 3 touches");
console.log("Actual:", zeroClusters.map(c =>
  "price=" + c.price + " touches=" + c.touches + " score=" + c.score
).join("; "));
console.log("BUG: Math.abs(0 - 0) / 0 = NaN, NaN < 0.04 = false");
console.log("     So identical $0 prices create SEPARATE clusters instead of merging");
console.log("");

// Test 2: Very small price near zero
const tinyPoints = [
  { price: 0.001, idx: 5 },
  { price: 0.001, idx: 10 },
];
const tinyClusters = clusterLevels(tinyPoints, 20, 0.04);
console.log("Price=0.001 clusters:", tinyClusters.length, "(expected: 1)");
console.log("  Math.abs(0.001 - 0.001) / 0.001 =", Math.abs(0.001 - 0.001) / 0.001);
console.log("");

// Test 3: Weighted average drift in cluster
// When a cluster absorbs many points, the weighted average drifts.
// Points sorted low-to-high are added sequentially, which can cause
// the cluster center to drift upward and fail to catch later points.
console.log("=== Cluster Drift Bug ===");
const driftPoints = [];
for (let i = 0; i < 20; i++) {
  // Prices from $1,680 to $1,720, evenly spaced ($2 apart)
  driftPoints.push({ price: 1680 + i * 2, idx: 50 + i });
}

const driftClusters = clusterLevels(driftPoints, 90, 0.04);
console.log("Input: 20 points from $1,680 to $1,720 ($2 apart)");
console.log("4% tolerance of $1,680 = $" + (1680 * 0.04).toFixed(2) + " = $67.20");
console.log("Full range ($1,680-$1,720) = $40, which is within 4% tolerance");
console.log("Clusters:", driftClusters.length);
driftClusters.forEach((c, i) => {
  console.log("  " + (i+1) + ". $" + c.price.toFixed(2) +
    " touches=" + c.touches + " score=" + c.score.toFixed(2));
});
console.log("Expected: 1 cluster. Got:", driftClusters.length);
console.log("");

// Test 4: Points sorted low-to-high means the cluster absorbs sequentially
// and the weighted average stays close to the first (lowest) point
const driftClusters2 = clusterLevels([
  { price: 1680, idx: 50 },
  { price: 1720, idx: 60 },
  { price: 1700, idx: 70 },
], 90, 0.04);
console.log("Test order sensitivity: $1,680, $1,720, $1,700");
console.log("Sorted order: $1,680, $1,700, $1,720 (low to high)");
console.log("Step 1: cluster at $1,680");
console.log("Step 2: |$1,680 - $1,700| / $1,680 = " +
  (Math.abs(1680 - 1700) / 1680).toFixed(4) + " < 0.04? " +
  (Math.abs(1680 - 1700) / 1680 < 0.04));
console.log("  -> $1,700 joins cluster (avg becomes ~$1,690)");
console.log("Step 3: |$1,690 - $1,720| / $1,690 = " +
  (Math.abs(1690 - 1720) / 1690).toFixed(4) + " < 0.04? " +
  (Math.abs(1690 - 1720) / 1690 < 0.04));
console.log("Clusters:", driftClusters2.length);
driftClusters2.forEach((c, i) => {
  console.log("  " + (i+1) + ". $" + c.price.toFixed(2) +
    " touches=" + c.touches);
});
