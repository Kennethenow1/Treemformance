/**
 * Optimal-tree mode — BST placement, goal comparison, slant-friendly hierarchy
 */
(function initTreeOptimal(global) {
  let nodeCounter = 0;

  const LEVEL3_POOL = [1, 2, 3, 4];
  const LEVEL3_GOAL_ORDER = [4, 3, 2, 1];

  function makeNode(value, isRoot = false) {
    nodeCounter += 1;
    return {
      id: isRoot ? "root" : `p${nodeCounter}`,
      value,
      left: null,
      right: null,
    };
  }

  function resetIds() {
    nodeCounter = 0;
  }

  function countNodes(node) {
    if (!node) return 0;
    return 1 + countNodes(node.left) + countNodes(node.right);
  }

  /** BST insert — returns edge key for animation */
  function bstInsert(tree, value) {
    if (!tree) {
      const node = makeNode(value, true);
      return { tree: node, node, parent: null, side: null, edge: null, isNew: true };
    }

    let current = tree;
    while (true) {
      if (value < current.value) {
        if (!current.left) {
          current.left = makeNode(value);
          return {
            tree,
            node: current.left,
            parent: current,
            side: "left",
            edge: `${current.id}-${current.left.id}`,
            isNew: true,
          };
        }
        current = current.left;
      } else if (value > current.value) {
        if (!current.right) {
          current.right = makeNode(value);
          return {
            tree,
            node: current.right,
            parent: current,
            side: "right",
            edge: `${current.id}-${current.right.id}`,
            isNew: true,
          };
        }
        current = current.right;
      } else {
        return { tree, node: current, parent: null, side: null, edge: null, isNew: false };
      }
    }
  }

  function getInsertPreview(tree, value) {
    if (!tree) return { parentId: null, childId: "pending", side: null };
    let current = tree;
    while (true) {
      if (value < current.value) {
        if (!current.left) return { parentId: current.id, childId: "pending", side: "left" };
        current = current.left;
      } else if (value > current.value) {
        if (!current.right) return { parentId: current.id, childId: "pending", side: "right" };
        current = current.right;
      } else {
        return { parentId: current.id, childId: current.id, side: null };
      }
    }
  }

  function getInsertPath(tree, value) {
    if (!tree) {
      return [
        { key: "ArrowDown", type: "tap" },
        { key: "ArrowLeft", type: "tap" },
      ];
    }

    const path = [];
    let node = tree;
    while (true) {
      if (value < node.value) {
        path.push({ key: "ArrowLeft", type: "tap" });
        if (!node.left) break;
        node = node.left;
      } else if (value > node.value) {
        path.push({ key: "ArrowRight", type: "tap" });
        if (!node.right) break;
        node = node.right;
      } else {
        break;
      }
      path.push({ key: "ArrowDown", type: "tap" });
    }
    return path.length ? path : [{ key: "ArrowDown", type: "tap" }];
  }

  const ARROW_GLYPH = {
    ArrowLeft: "←",
    ArrowDown: "↓",
    ArrowUp: "↑",
    ArrowRight: "→",
  };

  /** Merge direction + descend into simultaneous chord beats (Level 5+). */
  function getInsertChart(tree, value) {
    const raw = getInsertPath(tree, value);
    const chart = [];

    for (let i = 0; i < raw.length; i += 1) {
      const cur = raw[i];
      const next = raw[i + 1];
      if (
        next &&
        (cur.key === "ArrowLeft" || cur.key === "ArrowRight") &&
        next.key === "ArrowDown"
      ) {
        chart.push({ type: "chord", keys: [cur.key, next.key] });
        i += 1;
      } else {
        chart.push({ type: "tap", key: cur.key });
      }
    }

    return chart;
  }

  /** Card display — show first 4 beats, then "....." when longer. */
  function formatInsertPathDisplay(chart, maxShow = 4) {
    const parts = chart.map((entry) => {
      if (entry.type === "chord") {
        return entry.keys.map((k) => ARROW_GLYPH[k] || "").join("+");
      }
      return ARROW_GLYPH[entry.key] || "";
    });
    if (parts.length <= maxShow) return parts.join(" ");
    return `${parts.slice(0, maxShow).join(" ")} .....`;
  }

  function cloneChartEntry(entry) {
    if (entry.type === "chord") {
      return { type: "chord", keys: [...entry.keys] };
    }
    const beat = { type: entry.type || "tap", key: entry.key };
    if (entry.holdMs) beat.holdMs = entry.holdMs;
    return beat;
  }

  /**
   * Loop the insert pattern until the play chart hits a target length (Level 5 rhythm).
   */
  function extendInsertChart(chart, minLen = 9, maxLen = 13) {
    if (!chart?.length) return chart;

    const target =
      chart.length >= minLen && chart.length <= maxLen
        ? chart.length
        : minLen + Math.floor(Math.random() * (maxLen - minLen + 1));

    const result = [];
    let i = 0;
    while (result.length < target) {
      result.push(cloneChartEntry(chart[i % chart.length]));
      i += 1;
    }
    return result;
  }

  function getChoicePair(remaining, goalOrder) {
    const order = goalOrder || LEVEL3_GOAL_ORDER;
    const left = [...remaining];
    const goalPick = order.find((n) => remaining.has(n)) ?? left[0];
    const altPick = left.find((n) => n !== goalPick) ?? goalPick;
    return { goalPick, altPick };
  }

  function findNodeById(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    return findNodeById(node.left, id) || findNodeById(node.right, id);
  }

  function getInsertLabel(tree, value) {
    const preview = getInsertPreview(tree, value);
    if (!preview.parentId) return "new root";
    const parent = findNodeById(tree, preview.parentId);
    if (!parent) return preview.side === "left" ? "go left" : "go right";
    return preview.side === "left" ? `left of ${parent.value}` : `right of ${parent.value}`;
  }

  /** Stable slot id for comparing insert targets (parent value + side). */
  function getInsertSlot(tree, value) {
    const preview = getInsertPreview(tree, value);
    if (!preview.side) return "root";
    const parent = findNodeById(tree, preview.parentId);
    const parentKey = parent?.value ?? preview.parentId ?? "root";
    return `${parentKey}:${preview.side}`;
  }

  /**
   * Pick a decoy that would land in a different BST slot than `correct`.
   * Avoids "left of 8" questions where both options also go left of 8.
   */
  function pickDistinctSlotWrong(tree, correct, remaining) {
    const pool = [...remaining].filter((n) => n !== correct);
    if (!pool.length) return null;

    const targetSlot = getInsertSlot(tree, correct);
    const distinct = pool.filter((n) => getInsertSlot(tree, n) !== targetSlot);
    const choices = distinct.length ? distinct : pool;
    return choices[Math.floor(Math.random() * choices.length)];
  }

  function collectGoalPanIds(goal) {
    const ids = [];
    function walk(g) {
      if (!g) return;
      ids.push(`g${g.value}`);
      walk(g.left);
      walk(g.right);
    }
    walk(goal);
    return ids;
  }

  function nodeToHierarchy(node, pendingPreview = null) {
    if (!node) return null;

    const children = [];

    if (node.left) {
      children.push({ ...nodeToHierarchy(node.left, pendingPreview), branch: "left" });
    } else if (
      pendingPreview &&
      pendingPreview.parentId === node.id &&
      pendingPreview.side === "left"
    ) {
      children.push({ id: "pending", value: "?", branch: "left", children: [] });
    }

    if (node.right) {
      children.push({ ...nodeToHierarchy(node.right, pendingPreview), branch: "right" });
    } else if (
      pendingPreview &&
      pendingPreview.parentId === node.id &&
      pendingPreview.side === "right"
    ) {
      children.push({ id: "pending", value: "?", branch: "right", children: [] });
    }

    return {
      id: node.id,
      value: node.value,
      children,
    };
  }

  function toHierarchy(playerTree, pendingPreview = null) {
    if (!playerTree && (!pendingPreview || pendingPreview.parentId === null)) {
      return { id: "pending", value: "?", children: [] };
    }
    if (!playerTree) return null;
    return nodeToHierarchy(playerTree, pendingPreview);
  }

  function goalToHierarchy(goal) {
    if (!goal) return null;
    const children = [];
    if (goal.left) children.push({ ...goalToHierarchy(goal.left), branch: "left" });
    if (goal.right) children.push({ ...goalToHierarchy(goal.right), branch: "right" });
    return {
      id: `g${goal.value}`,
      value: goal.value,
      children,
    };
  }

  /** Goal shape only — every node shows ? */
  function goalStructureHierarchy(goal) {
    if (!goal) return null;
    const children = [];
    if (goal.left) children.push({ ...goalStructureHierarchy(goal.left), branch: "left" });
    if (goal.right) children.push({ ...goalStructureHierarchy(goal.right), branch: "right" });
    return {
      id: `g${goal.value}`,
      value: "?",
      children,
    };
  }

  function collectCompareSlots(goal, player) {
    const slots = [];
    function walk(g, p) {
      if (!g) return;
      slots.push({
        goalId: `g${g.value}`,
        goalValue: g.value,
        playerId: p?.id ?? null,
        playerValue: p?.value ?? null,
        match: p != null && p.value === g.value,
      });
      walk(g.left, p?.left ?? null);
      walk(g.right, p?.right ?? null);
    }
    walk(goal, player);
    return slots;
  }

  /** Preorder walk of the player tree — natural reveal order for compare animation */
  function collectPlayerRevealSlots(player) {
    const slots = [];
    function walk(p) {
      if (!p) return;
      slots.push({ playerId: p.id, playerValue: p.value });
      walk(p.left);
      walk(p.right);
    }
    walk(player);
    return slots;
  }

  function compareTrees(player, goal) {
    const issues = [];
    const mismatchIds = new Set();

    function walk(p, g) {
      if (!g) return;
      if (!p) {
        issues.push({ type: "missing", expected: g.value });
        walk(null, g.left);
        walk(null, g.right);
        return;
      }
      if (p.value !== g.value) {
        issues.push({ type: "wrong", got: p.value, expected: g.value });
        mismatchIds.add(p.id);
      }
      walk(p.left, g.left);
      walk(p.right, g.right);
    }

    walk(player, goal);

    const goalCount = countNodes(goal);
    const playerCount = countNodes(player);
    if (playerCount > goalCount) {
      issues.push({ type: "extra", count: playerCount - goalCount });
    }

    const structureMismatches = issues.filter(
      (i) => i.type === "wrong" || i.type === "missing"
    ).length;

    return {
      issues,
      mismatchIds: [...mismatchIds],
      goalCount,
      playerCount,
      matches: Math.max(0, goalCount - structureMismatches),
      penaltyPerIssue: 18,
    };
  }

  function scorePenalty(result) {
    let penalty = 0;
    result.issues.forEach((issue) => {
      if (issue.type === "wrong") penalty += result.penaltyPerIssue;
      else if (issue.type === "missing") penalty += result.penaltyPerIssue;
      else if (issue.type === "extra") penalty += result.penaltyPerIssue * issue.count;
    });
    return penalty;
  }

  const LEVEL3_GOAL = {
    value: 4,
    left: {
      value: 3,
      left: {
        value: 2,
        left: { value: 1 },
      },
    },
  };

  const LEVEL4_POOL = [3, 7, 9, 11, 14, 18, 22];

  /** BST insert order that builds the goal shape */
  const LEVEL4_GOAL_ORDER = [14, 9, 22, 7, 11, 18, 3];

  const LEVEL4_GOAL = {
    value: 14,
    left: {
      value: 9,
      left: {
        value: 7,
        left: { value: 3 },
      },
      right: { value: 11 },
    },
    right: {
      value: 22,
      left: { value: 18 },
    },
  };

  const LEVEL5_POOL = [2, 5, 10, 15, 20, 30, 42, 48, 55, 68, 72, 80];

  const LEVEL5_GOAL_ORDER = [42, 20, 10, 5, 2, 15, 30, 68, 55, 48, 80, 72];

  const LEVEL5_GOAL = {
    value: 42,
    left: {
      value: 20,
      left: {
        value: 10,
        left: {
          value: 5,
          left: { value: 2 },
        },
        right: { value: 15 },
      },
      right: { value: 30 },
    },
    right: {
      value: 68,
      left: {
        value: 55,
        left: { value: 48 },
      },
      right: {
        value: 80,
        left: { value: 72 },
      },
    },
  };

  global.TreeOptimal = {
    makeNode,
    resetIds,
    bstInsert,
    getInsertPreview,
    getInsertPath,
    getInsertChart,
    formatInsertPathDisplay,
    extendInsertChart,
    getChoicePair,
    getInsertLabel,
    getInsertSlot,
    pickDistinctSlotWrong,
    compareTrees,
    collectCompareSlots,
    collectPlayerRevealSlots,
    collectGoalPanIds,
    scorePenalty,
    toHierarchy,
    goalToHierarchy,
    goalStructureHierarchy,
    LEVEL3_POOL,
    LEVEL3_GOAL,
    LEVEL3_GOAL_ORDER,
    LEVEL4_POOL,
    LEVEL4_GOAL,
    LEVEL4_GOAL_ORDER,
    LEVEL5_POOL,
    LEVEL5_GOAL,
    LEVEL5_GOAL_ORDER,
  };
})(window);
