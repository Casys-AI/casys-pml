# Learnable Hierarchy Alpha Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `alphaUp` and `alphaDown` learnable parameters (optimized by gradient descent) instead of fixed hyperparameters, so the GRU learns the optimal hierarchy soft-label spread per training run.

**Architecture:** Replace the JS-side Float32Array soft-target construction with TF ops so gradients flow through alpha. Alpha values are `tf.Variable` scalars passed through sigmoid to stay in [0, 0.5]. The hierarchy adjacency (which tool has which parent caps, which cap has which child tools) is pre-built as sparse index tensors, reused every batch. Alpha is persisted in the weight checkpoint alongside other model weights.

**Tech Stack:** TensorFlow.js (tfjs-node), Deno TypeScript

---

## Context: Current Architecture

The soft-target construction happens in `gru-model.ts:trainBatch()` (lines ~830-866):
- `alphaUp` / `alphaDown` are read from `this.config` (static `0.2`)
- A `Float32Array` is filled per-batch in a JS loop (not differentiable)
- The result becomes `hierarchyTargetTensor` used in the loss

**Why this matters:** With natural hierarchy, the model learns structure via these soft labels. A fixed alpha=0.2 may not be optimal — different training stages or different hierarchy depths might benefit from different alpha values.

## Approach

1. Create two `tf.Variable` scalars: `rawAlphaUp`, `rawAlphaDown` (initialized to `logit(0.2) ≈ -1.386`)
2. Use `sigmoid(rawAlpha)` to get the effective alpha in [0, 1] (clamped further by design to [0, 0.5])
3. Build the hierarchy target tensor using TF ops: scatter parent/child indices, multiply by alpha
4. Add `rawAlphaUp`, `rawAlphaDown` to `trainableVars` so the optimizer updates them
5. Log effective alpha values per epoch for monitoring
6. Persist alpha in the weight checkpoint (2 extra scalars)

### Pre-computed adjacency tensors (built once in `setToolVocabulary`)

```
parentIdxTensor:  [batchTarget] → ragged list of parent cap indices
childIdxTensor:   [batchTarget] → ragged list of child tool indices
```

Since TF.js doesn't support ragged tensors well, we use a simpler approach:
- Pre-build a dense `hierMask` tensor of shape `[vocabSize, vocabSize]` with the adjacency
- Per-batch: gather rows by target indices, multiply by alpha, add (1-alpha) on diagonal

This is too memory-heavy for vocabSize=1198. Better approach:

**Hybrid: JS builds the sparse structure, TF multiplies by alpha:**
- JS loop builds `hierArr` with 1.0 on target and 1.0 on neighbors (unweighted)
- Two separate masks: `parentMask` (tools→caps) and `childMask` (caps→tools)
- TF computes: `target = (1 - alpha) * oneHot + alpha * neighborMask` (differentiable)

---

### Task 1: Add learnable alpha variables to GRU model

**Files:**
- Modify: `lib/gru/src/transition/gru-model.ts` (class properties + buildModel)
- Modify: `lib/gru/src/transition/types.ts` (config flag)

**Step 1: Add config flag and class properties**

In `types.ts`, add to `CompactInformedGRUConfig`:
```typescript
/** If true, alphaUp/Down are learned via gradient. Config values become initial values. */
learnableAlpha: boolean;
```

Default in `DEFAULT_CONFIG`:
```typescript
learnableAlpha: true,
```

In `gru-model.ts`, add class properties:
```typescript
private rawAlphaUp: tf.Variable | null = null;
private rawAlphaDown: tf.Variable | null = null;
```

**Step 2: Initialize variables in buildModel()**

After `this.buildModel()` in constructor or after model is built, add:
```typescript
if (this.config.learnableAlpha) {
  // Initialize to logit of config value: sigmoid(x) = alpha → x = log(alpha / (1 - alpha))
  const initUp = Math.log(this.config.hierarchyAlphaUp / (1 - this.config.hierarchyAlphaUp));
  const initDown = Math.log(this.config.hierarchyAlphaDown / (1 - this.config.hierarchyAlphaDown));
  this.rawAlphaUp = tf.variable(tf.scalar(initUp), true, 'raw_alpha_up');
  this.rawAlphaDown = tf.variable(tf.scalar(initDown), true, 'raw_alpha_down');
}
```

**Step 3: Commit**
```bash
git add lib/gru/src/transition/gru-model.ts lib/gru/src/transition/types.ts
git commit -m "feat(gru): add learnable alpha variables (scaffolding)"
```

---

### Task 2: Rewrite soft-target construction with TF ops

**Files:**
- Modify: `lib/gru/src/transition/gru-model.ts` (trainBatch method, lines ~830-866)

**Step 1: Build neighbor masks in JS (unweighted), let TF apply alpha**

Replace the current soft-target construction block (lines 830-866) with:

```typescript
// --- Build hierarchy soft targets (learnable or fixed alpha) ---
let hierarchyTargetTensor: tf.Tensor2D | null = null;
const hasHierarchy = this.toolIdxToCapIndices.size > 0 || this.capIdxToChildIndices.size > 0;

if (hasHierarchy) {
  // Build two Float32Array masks: parentSpread and childSpread
  // parentSpread[b][capIdx] = 1/numParents if target b is a tool with parent caps
  // childSpread[b][childIdx] = 1/numChildren if target b is a cap with children
  const parentSpreadArr = new Float32Array(batchSize * vs);
  const childSpreadArr = new Float32Array(batchSize * vs);
  const hasParentArr = new Float32Array(batchSize); // 1 if tool with parents
  const hasChildArr = new Float32Array(batchSize);  // 1 if cap with children

  for (let b = 0; b < batchSize; b++) {
    const tIdx = targetIndices[b];
    const parentCaps = this.toolIdxToCapIndices.get(tIdx);
    const childTools = this.capIdxToChildIndices.get(tIdx);

    if (parentCaps && parentCaps.length > 0) {
      hasParentArr[b] = 1;
      const share = 1.0 / parentCaps.length;
      for (const capIdx of parentCaps) {
        parentSpreadArr[b * vs + capIdx] = share;
      }
    } else if (childTools && childTools.length > 0) {
      hasChildArr[b] = 1;
      const share = 1.0 / childTools.length;
      for (const childIdx of childTools) {
        childSpreadArr[b * vs + childIdx] = share;
      }
    }
  }

  // TF ops: alpha * neighborMask + (1 - alpha) * oneHot (differentiable)
  const oneHot = tf.oneHot(targetIdxTensor, vs).toFloat();
  const parentMask = tf.tensor2d(parentSpreadArr, [batchSize, vs]);
  const childMask = tf.tensor2d(childSpreadArr, [batchSize, vs]);
  const hasParent = tf.tensor1d(hasParentArr).expandDims(1); // [B, 1]
  const hasChild = tf.tensor1d(hasChildArr).expandDims(1);

  let alphaUpVal: tf.Scalar;
  let alphaDownVal: tf.Scalar;

  if (this.config.learnableAlpha && this.rawAlphaUp && this.rawAlphaDown) {
    alphaUpVal = tf.sigmoid(this.rawAlphaUp) as tf.Scalar;
    alphaDownVal = tf.sigmoid(this.rawAlphaDown) as tf.Scalar;
  } else {
    alphaUpVal = tf.scalar(this.config.hierarchyAlphaUp);
    alphaDownVal = tf.scalar(this.config.hierarchyAlphaDown);
  }

  // For tools with parents: (1 - alphaUp) * oneHot + alphaUp * parentMask
  const parentTarget = oneHot.mul(tf.scalar(1).sub(alphaUpVal)).add(parentMask.mul(alphaUpVal));
  // For caps with children: (1 - alphaDown) * oneHot + alphaDown * childMask
  const childTarget = oneHot.mul(tf.scalar(1).sub(alphaDownVal)).add(childMask.mul(alphaDownVal));
  // Select: hasParent → parentTarget, hasChild → childTarget, else → oneHot
  hierarchyTargetTensor = parentTarget.mul(hasParent)
    .add(childTarget.mul(hasChild))
    .add(oneHot.mul(tf.scalar(1).sub(hasParent).sub(hasChild))) as tf.Tensor2D;

  // Cleanup non-variable tensors
  parentMask.dispose();
  childMask.dispose();
  hasParent.dispose();
  hasChild.dispose();
}
```

**Step 2: Add alpha variables to trainableVars**

In `trainBatch`, after `const trainableVars = model.trainableWeights.map(...)`:
```typescript
if (this.config.learnableAlpha && this.rawAlphaUp && this.rawAlphaDown) {
  trainableVars.push(this.rawAlphaUp);
  trainableVars.push(this.rawAlphaDown);
}
```

**Step 3: Run existing data-prep tests to verify no regression**
```bash
deno test lib/gru/src/data-prep/ --allow-all
```
Expected: 6/6 PASS (data-prep is independent)

**Step 4: Commit**
```bash
git add lib/gru/src/transition/gru-model.ts
git commit -m "feat(gru): differentiable hierarchy soft targets via TF ops"
```

---

### Task 3: Log effective alpha per epoch

**Files:**
- Modify: `lib/gru/src/train-worker-prod.ts` (epoch logging)
- Modify: `lib/gru/src/transition/gru-model.ts` (getter method)

**Step 1: Add getter for effective alpha**

In `gru-model.ts`:
```typescript
/** Get current effective alpha values (after sigmoid for learnable, config for fixed) */
getEffectiveAlpha(): { alphaUp: number; alphaDown: number } {
  if (this.config.learnableAlpha && this.rawAlphaUp && this.rawAlphaDown) {
    const up = tf.sigmoid(this.rawAlphaUp).dataSync()[0];
    const down = tf.sigmoid(this.rawAlphaDown).dataSync()[0];
    return { alphaUp: up, alphaDown: down };
  }
  return {
    alphaUp: this.config.hierarchyAlphaUp,
    alphaDown: this.config.hierarchyAlphaDown,
  };
}
```

**Step 2: Log alpha in train-worker-prod.ts epoch logging**

In the eval epoch block (around line ~440), after logging test metrics:
```typescript
const { alphaUp: effAlphaUp, alphaDown: effAlphaDown } = model.getEffectiveAlpha();
// Append to epoch log line
console.error(`[GRU Worker] Epoch ${epoch+1} alpha: up=${effAlphaUp.toFixed(4)}, down=${effAlphaDown.toFixed(4)}`);
```

**Step 3: Commit**
```bash
git add lib/gru/src/transition/gru-model.ts lib/gru/src/train-worker-prod.ts
git commit -m "feat(gru): log effective alpha per epoch"
```

---

### Task 4: Persist alpha in weight checkpoint

**Files:**
- Modify: `lib/gru/src/transition/gru-model.ts` (serializeWeights/setWeights)

**Step 1: Include alpha in getWeightsData()**

The current `getWeightsData()` (around line 1638) serializes `model.getWeights()`. Add alpha:

After `const weights: number[][] = tensors.map(...)`:
```typescript
// Append learnable alpha to checkpoint
if (this.config.learnableAlpha && this.rawAlphaUp && this.rawAlphaDown) {
  names.push('raw_alpha_up');
  names.push('raw_alpha_down');
  weights.push(Array.from(this.rawAlphaUp.dataSync()));
  weights.push(Array.from(this.rawAlphaDown.dataSync()));
}
```

**Step 2: Restore alpha in setWeightsData()**

The current `setWeightsData()` (around line 1652) restores via `model.setWeights()`. Add:

After the model weights are set, check for alpha:
```typescript
// Restore learnable alpha if present in checkpoint
if (this.config.learnableAlpha && this.rawAlphaUp && this.rawAlphaDown) {
  const alphaUpIdx = data.names?.indexOf('raw_alpha_up') ?? -1;
  const alphaDownIdx = data.names?.indexOf('raw_alpha_down') ?? -1;
  if (alphaUpIdx >= 0 && data.weights[alphaUpIdx]) {
    this.rawAlphaUp.assign(tf.scalar(data.weights[alphaUpIdx][0]));
  }
  if (alphaDownIdx >= 0 && data.weights[alphaDownIdx]) {
    this.rawAlphaDown.assign(tf.scalar(data.weights[alphaDownIdx][0]));
  }
  const { alphaUp, alphaDown } = this.getEffectiveAlpha();
  console.error(`[GRU] Restored learnable alpha: up=${alphaUp.toFixed(4)}, down=${alphaDown.toFixed(4)}`);
}
```

**Step 3: Verify backward compatibility**

Old checkpoints without alpha should still load (the indexOf returns -1, no-op). New checkpoints with alpha should restore correctly on warm start.

**Step 4: Commit**
```bash
git add lib/gru/src/transition/gru-model.ts
git commit -m "feat(gru): persist learnable alpha in weight checkpoint"
```

---

### Task 5: Cleanup and dispose alpha variables

**Files:**
- Modify: `lib/gru/src/transition/gru-model.ts` (dispose/cleanup)

**Step 1: Dispose alpha in model disposal**

Find where `this.model.dispose()` is called and add:
```typescript
if (this.rawAlphaUp) { this.rawAlphaUp.dispose(); this.rawAlphaUp = null; }
if (this.rawAlphaDown) { this.rawAlphaDown.dispose(); this.rawAlphaDown = null; }
```

**Step 2: Commit**
```bash
git add lib/gru/src/transition/gru-model.ts
git commit -m "fix(gru): dispose learnable alpha variables on cleanup"
```

---

### Task 6: Integration test — train and verify alpha moves

**Files:**
- Test manually via training script

**Step 1: Run a short training (10 epochs) and verify alpha logs**
```bash
export DATABASE_URL="postgres://casys:Kx9mP2vL7nQ4wRzT@localhost:5432/casys"
PROD_ONLY=true COLD_START=true SKIP_SHGAT=true deno run -A scripts/train-gru-with-caps.ts 2>&1 | grep -E "alpha|hit1|Final"
```

**Expected:**
- Alpha values should change from initial 0.2000/0.2000
- If alpha moves significantly (e.g., 0.15 or 0.30), the gradient signal is flowing
- Hit@1 should be comparable or better than fixed alpha=0.2

**Step 2: Verify warm start restores alpha**
```bash
PROD_ONLY=true SKIP_SHGAT=true deno run -A scripts/train-gru-with-caps.ts 2>&1 | grep "alpha"
```

**Expected:** Alpha starts from the values learned in step 1, not from 0.2

**Step 3: Commit any fixes discovered during testing**

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Alpha collapses to 0 (no hierarchy signal) | Monitor logs; if consistent, add regularization term `lambda * (alpha - 0.2)^2` |
| Alpha explodes to 1 (all probability to neighbors) | Sigmoid naturally bounds to [0, 1]; could clamp to [0, 0.5] with `sigmoid(x) * 0.5` |
| Memory overhead from extra tensors per batch | parentMask/childMask are sparse in practice; dispose after use |
| Backward compat with old checkpoints | indexOf-based restore = graceful fallback |
| `learnableAlpha=false` regression | Config flag preserves old behavior exactly |

## Env vars for A/B testing

- `LEARNABLE_ALPHA=false` → reverts to fixed alpha (for comparison)
- Could be wired in train-gru-with-caps.ts: `learnableAlpha: Deno.env.get("LEARNABLE_ALPHA") !== "false"`
