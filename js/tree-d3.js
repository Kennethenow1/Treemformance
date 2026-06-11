/**
 * TREEFORMANCE — D3 binary tree renderer
 * Monochrome nodes, straight edges, game state classes from tree.css / level.css
 */
(function initTreeD3(global) {
  const ROOT_R = 26;
  const NODE_R = 24;
  const RING_PAD = 12;
  const SHADOW_OFF = 3;

  function visitTree(node, fn, parentId = null) {
    fn(node, parentId);
    (node.children || []).forEach((child) => visitTree(child, fn, node.id));
  }

  function collectFillOrder(root) {
    const list = [];
    visitTree(root, (n) => {
      if (n.fillOrder != null) list.push(n);
    });
    return list.sort((a, b) => a.fillOrder - b.fillOrder);
  }

  function linkId(parentId, childId) {
    return `${parentId}-${childId}`;
  }

  class TreeMap {
    constructor(containerEl, options = {}) {
      const el = typeof containerEl === "string" ? document.querySelector(containerEl) : containerEl;
      if (!el) throw new Error("TreeMap: container not found");

      this.container = el;
      this.data = options.data;
      this.mode = options.mode || "fill";
      this.layoutOpts = options.layout || {};
      this.fillOrder = collectFillOrder(this.data);
      this.nodeState = {};
      this.linkState = {};
      this.nodeById = new Map();
      this.linkById = new Map();

      this._initState(options);
      this._measure();
      this._render();
      this._bindResizeObserver();
    }

    _bindResizeObserver() {
      if (typeof ResizeObserver === "undefined") return;
      this._resizeRaf = 0;
      this._resizeObs = new ResizeObserver(() => {
        if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
        this._resizeRaf = requestAnimationFrame(() => {
          this._resizeRaf = 0;
          this.resize();
        });
      });
      this._resizeObs.observe(this.container);
    }

    static mount(selector, options) {
      if (!global.d3) return null;
      return new TreeMap(selector, options);
    }

    static mountGoalStructure(containerEl, data, layout = {}) {
      if (!global.d3) return null;
      const el =
        typeof containerEl === "string" ? document.querySelector(containerEl) : containerEl;
      if (!el) return null;

      const map = new TreeMap(el, {
        data,
        mode: "goal-structure",
        showAll: true,
        layout,
      });

      Object.keys(map.nodeState).forEach((id) => {
        const ns = map.nodeState[id];
        ns.ghost = true;
        ns.placed = false;
        ns.pending = false;
        ns.highlight = false;
        ns.label = "?";
      });
      Object.keys(map.linkState).forEach((id) => {
        map.linkState[id].ghost = true;
      });
      map._syncAll();
      return map;
    }

    static mountTutorial(containerEl, variant) {
      if (!global.d3) return null;
      const el =
        typeof containerEl === "string" ? document.querySelector(containerEl) : containerEl;
      if (!el) return null;

      el.closest(".tree-diagram")?.classList.add("tree-diagram--tutorial");

      if (variant === "level3") {
        const map = new TreeMap(el, {
          data: global.TreeMap.TUTORIAL_L3_DATA,
          mode: "tutorial",
          showAll: true,
          layout: { type: "slant", slantDx: 58, slantDy: 52, padX: 42, padY: 36 },
        });
        map.nodeState.root.highlight = true;
        map.nodeState.g3.ghost = true;
        map.nodeState.g2.ghost = true;
        map.nodeState.g1.ghost = true;
        map.linkState["root-g3"].ghost = true;
        map.linkState["g3-g2"].ghost = true;
        map.linkState["g2-g1"].ghost = true;
        map._syncAll();
        return map;
      }

      if (variant === "level4") {
        const map = new TreeMap(el, {
          data: global.TreeMap.TUTORIAL_L4_DATA,
          mode: "tutorial",
          showAll: true,
          layout: global.TreeMap.TUTORIAL_L4_LAYOUT,
        });
        map.nodeState.g14.highlight = true;
        ["g9", "g7", "g3", "g11", "g22", "g18"].forEach((id) => {
          if (map.nodeState[id]) map.nodeState[id].ghost = true;
        });
        Object.keys(map.linkState).forEach((id) => {
          map.linkState[id].ghost = true;
        });
        map._syncAll();
        return map;
      }

      if (variant === "level5") {
        const map = new TreeMap(el, {
          data: global.TreeMap.TUTORIAL_L5_DATA,
          mode: "tutorial",
          showAll: true,
          layout: global.TreeMap.SLANT_GAME_LAYOUT_L5,
        });
        map.nodeState.g42.highlight = true;
        [
          "g20", "g10", "g5", "g2", "g15", "g30",
          "g68", "g55", "g48", "g80", "g72",
        ].forEach((id) => {
          if (map.nodeState[id]) map.nodeState[id].ghost = true;
        });
        Object.keys(map.linkState).forEach((id) => {
          map.linkState[id].ghost = true;
        });
        map._syncAll();
        return map;
      }

      if (variant === "level2") {
        const map = new TreeMap(el, {
          data: global.TreeMap.TUTORIAL_L2_DATA,
          mode: "tutorial",
          showAll: true,
          layout: { nodeSize: [96, 78], padX: 40, padY: 32 },
        });
        map.nodeState.root.highlight = true;
        map.nodeState["t-left"].ghost = true;
        map.nodeState["t-right"].ghost = true;
        map.nodeState["t-right"].label = "?";
        map.linkState["root-t-left"].ghost = true;
        map.linkState["root-t-right"].ghost = true;
        map._syncAll();
        return map;
      }

      const map = new TreeMap(el, {
        data: global.TreeMap.TUTORIAL_L1_DATA,
        mode: "tutorial",
        showAll: true,
        layout: { nodeSize: [88, 82], padX: 36, padY: 34 },
      });
      map.nodeState.root.highlight = true;
      map._syncAll();
      return map;
    }

    static linkId(parentId, childId) {
      return linkId(parentId, childId);
    }

    _initState(options) {
      const visible = new Set(options.visibleIds || ["root"]);
      if (options.showAll) visible.add("__all__");

      visitTree(this.data, (node, parentId) => {
        const show = visible.has("__all__") || visible.has(node.id);
        this.nodeState[node.id] = {
          concealed: !show,
          pending: false,
          highlight: false,
          path: false,
          placed: node.id === "root",
          ghost: false,
          auto: false,
          mismatch: false,
          compareHidden: false,
          compareReveal: false,
          label: String(node.value),
        };

        if (parentId) {
          const id = linkId(parentId, node.id);
          this.linkState[id] = {
            concealed: !show,
            pending: false,
            building: false,
            built: false,
            ghost: false,
            progress: 0,
          };
        }
      });
    }

    _measure() {
      const rect = this.container.getBoundingClientRect();
      let w = rect.width || this.container.clientWidth;
      let h = rect.height || this.container.clientHeight;

      if (h < 48) {
        const panel = this.container.closest(
          ".tree-arena, .tree-diagram--goal-ref, .play-window__right, .play-window"
        );
        if (panel) {
          const panelRect = panel.getBoundingClientRect();
          w = w || panelRect.width;
          h = panelRect.height - 36;
        }
      }

      this.width = Math.max(w || 320, 200);
      this.height = Math.max(h || 240, 160);
    }

    _nodeRadius(id) {
      return id === "root" ? ROOT_R : NODE_R;
    }

    _strokePad(id) {
      return id === "root" ? 1.75 : 1.5;
    }

    _linkEndpoints(source, target) {
      const sx = source.x;
      const sy = source.y;
      const tx = target.x;
      const ty = target.y;
      const dx = tx - sx;
      const dy = ty - sy;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) return { x1: sx, y1: sy, x2: tx, y2: ty };

      const ux = dx / dist;
      const uy = dy / dist;
      const startPad = this._nodeRadius(source.data.id) + this._strokePad(source.data.id);
      const endPad = this._nodeRadius(target.data.id) + this._strokePad(target.data.id);

      return {
        x1: sx + ux * startPad,
        y1: sy + uy * startPad,
        x2: tx - ux * endPad,
        y2: ty - uy * endPad,
      };
    }

    _layout() {
      if (this.layoutOpts.type === "slant") {
        this._layoutSlant();
        return;
      }

      const root = global.d3.hierarchy(this.data, (d) => d.children);
      const [nodeW, nodeH] = this.layoutOpts.nodeSize || [72, 88];
      const treeLayout = global.d3
        .tree()
        .nodeSize([nodeW, nodeH])
        .separation((a, b) => (a.parent === b.parent ? 1.15 : 1.35));

      treeLayout(root);

      const nodes = root.descendants();
      const links = root.links();

      const xs = nodes.map((d) => d.x);
      const ys = nodes.map((d) => d.y);
      const padX = this.layoutOpts.padX ?? 44;
      const padY = this.layoutOpts.padY ?? 36;
      const minX = Math.min(...xs) - padX;
      const maxX = Math.max(...xs) + padX;
      const minY = Math.min(...ys) - padY;
      const maxY = Math.max(...ys) + padY;

      this.contentViewBox = [minX, minY, maxX - minX, maxY - minY];
      this.viewBox = this.layoutOpts.fixedViewBox || this.contentViewBox;
      this.layoutRoot = root;
      this.layoutNodes = nodes;
      this.layoutLinks = links;
    }

    _shiftSubtree(node, deltaX) {
      node.x += deltaX;
      (node.children || []).forEach((child) => this._shiftSubtree(child, deltaX));
    }

    _nodeClearance() {
      return (NODE_R + RING_PAD) * 2 + 20;
    }

    /** Lowest diverging branches for a pair — stable cross-depth separation. */
    _pairSeparationRoots(a, b) {
      let leftNode = a;
      let rightNode = b;
      while (
        leftNode.parent &&
        rightNode.parent &&
        leftNode.parent === rightNode.parent
      ) {
        leftNode = leftNode.parent;
        rightNode = rightNode.parent;
      }
      if (leftNode.x <= rightNode.x) {
        return { leftRoot: leftNode, rightRoot: rightNode };
      }
      return { leftRoot: rightNode, rightRoot: leftNode };
    }

    /** When cousins collide, shift parent subtrees apart so diagonal edges stay intact. */
    _subtreeSeparationRoot(node, sibling) {
      const parent = node.parent;
      if (!parent) return node;
      if (sibling && sibling.parent === parent) return node;
      const grandparent = parent.parent;
      if (!grandparent) return parent;
      return parent;
    }

    _resolveSlantOverlaps(nodes) {
      const minGap = this._nodeClearance();
      const dy = this.layoutOpts.slantDy ?? 62;
      let moved = false;
      const buckets = new Map();

      nodes.forEach((n) => {
        const key = Math.round(n.y / dy);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(n);
      });

      for (const row of buckets.values()) {
        if (row.length < 2) continue;
        row.sort((a, b) => a.x - b.x);
        for (let i = 1; i < row.length; i++) {
          const gap = row[i].x - row[i - 1].x;
          if (gap < minGap) {
            const push = (minGap - gap) * 0.5;
            const leftRoot = this._subtreeSeparationRoot(row[i - 1], row[i]);
            const rightRoot = this._subtreeSeparationRoot(row[i], row[i - 1]);
            this._shiftSubtree(leftRoot, -push);
            this._shiftSubtree(rightRoot, push);
            moved = true;
          }
        }
      }
      return moved;
    }

    /** Nodes one level apart can still overlap diagonally (e.g. g30 vs g48). */
    _resolveCrossDepthOverlaps(nodes) {
      const minDist = this._nodeClearance();
      const dy = this.layoutOpts.slantDy ?? 62;
      let moved = false;

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const vert = Math.abs(a.y - b.y);
          if (vert < 1 || vert > dy * 1.05) continue;

          const dist = Math.hypot(b.x - a.x, vert);
          if (dist >= minDist) continue;

          const push = (minDist - dist) * 0.5 + 1;
          const { leftRoot, rightRoot } = this._pairSeparationRoots(a, b);
          this._shiftSubtree(leftRoot, -push);
          this._shiftSubtree(rightRoot, push);
          moved = true;
        }
      }

      return moved;
    }

    /** Every parent→child edge must have meaningful horizontal offset (never vertical). */
    _enforceDiagonalEdges(root) {
      const dx = this.layoutOpts.slantDx ?? 72;
      const minHoriz = dx * 0.62;
      let adjusted = false;

      const visit = (node) => {
        for (const child of node.children || []) {
          const horiz = child.x - node.x;
          const goLeft = child.data.branch !== "right";
          const wantSign = goLeft ? -1 : 1;
          const actualSign = horiz === 0 ? 0 : Math.sign(horiz);

          if (Math.abs(horiz) < minHoriz || actualSign !== wantSign) {
            const targetX = node.x + wantSign * minHoriz;
            this._shiftSubtree(child, targetX - child.x);
            adjusted = true;
          }
          visit(child);
        }
      };

      visit(root);
      return adjusted;
    }

    /**
     * Pure diagonal slant — every child is offset dx left/right AND dy down.
     * Overlap passes alternate with diagonal enforcement so shifts never
     * collapse an edge to vertical.
     */
    _layoutSlant() {
      const dx = this.layoutOpts.slantDx ?? 72;
      const dy = this.layoutOpts.slantDy ?? 62;
      const padX = this.layoutOpts.padX ?? 52;
      const padY = this.layoutOpts.padY ?? 44;

      const root = global.d3.hierarchy(this.data, (d) => d.children);

      const assign = (node, x, y) => {
        node.x = x;
        node.y = y;
        (node.children || []).forEach((child) => {
          const goLeft = child.data.branch !== "right";
          assign(child, x + (goLeft ? -dx : dx), y + dy);
        });
      };

      assign(root, 0, 0);

      const nodes = root.descendants();
      for (let pass = 0; pass < 20; pass++) {
        const overlapped = this._resolveSlantOverlaps(nodes);
        const crossDepth = this._resolveCrossDepthOverlaps(nodes);
        const diagonal = this._enforceDiagonalEdges(root);
        if (!overlapped && !crossDepth && !diagonal) break;
      }

      const links = root.links();
      const xs = nodes.map((d) => d.x);
      const ys = nodes.map((d) => d.y);
      const minX = Math.min(...xs) - padX;
      const maxX = Math.max(...xs) + padX;
      const minY = Math.min(...ys) - padY;
      const maxY = Math.max(...ys) + padY;

      this.contentViewBox = [minX, minY, maxX - minX, maxY - minY];
      this.viewBox = this.layoutOpts.fixedViewBox || this.contentViewBox;
      this.layoutRoot = root;
      this.layoutNodes = nodes;
      this.layoutLinks = links;
    }

    _displayViewBox() {
      if (this.layoutOpts.camera && this.cameraViewBox) return this.cameraViewBox;
      return this.viewBox;
    }

    _applyViewBox(vb) {
      this.cameraViewBox = vb;
      if (this.svgSel) this.svgSel.attr("viewBox", vb.join(" "));
    }

    _boundsFromLayoutNodes(nodes, padding = 48) {
      if (!nodes.length) return (this.contentViewBox || this.viewBox).slice();
      const pad = padding;
      const r = NODE_R + RING_PAD + 6;
      const xs = nodes.map((n) => n.x);
      const ys = nodes.map((n) => n.y);
      const minX = Math.min(...xs) - r - pad;
      const maxX = Math.max(...xs) + r + pad;
      const minY = Math.min(...ys) - r - pad;
      const maxY = Math.max(...ys) + r + pad;
      return [minX, minY, maxX - minX, maxY - minY];
    }

    _boundsContains(outer, inner, margin = 0) {
      const [ox, oy, ow, oh] = outer;
      const [ix, iy, iw, ih] = inner;
      return (
        ix >= ox - margin &&
        iy >= oy - margin &&
        ix + iw <= ox + ow + margin &&
        iy + ih <= oy + oh + margin
      );
    }

    _expandViewBoxToInclude(vb, inner, margin = 10) {
      if (this._boundsContains(vb, inner, margin)) return vb.slice();
      const [ix, iy, iw, ih] = inner;
      const inMinX = ix - margin;
      const inMinY = iy - margin;
      const inMaxX = ix + iw + margin;
      const inMaxY = iy + ih + margin;
      const [x, y, w, h] = vb;
      const newMinX = Math.min(x, inMinX);
      const newMinY = Math.min(y, inMinY);
      const newMaxX = Math.max(x + w, inMaxX);
      const newMaxY = Math.max(y + h, inMaxY);
      return [newMinX, newMinY, newMaxX - newMinX, newMaxY - newMinY];
    }

    _viewBoxChange(a, b) {
      return Math.max(
        Math.abs(a[0] - b[0]),
        Math.abs(a[1] - b[1]),
        Math.abs(a[2] - b[2]),
        Math.abs(a[3] - b[3])
      );
    }

    _animateViewBox(targetVb, duration = 500) {
      const start = (this.cameraViewBox || this.contentViewBox || this.viewBox).slice();
      if (duration <= 0 || global.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this._applyViewBox(targetVb);
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        const t0 = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / duration);
          const ease = 1 - (1 - t) ** 3;
          const vb = start.map((v, i) => v + (targetVb[i] - v) * ease);
          this._applyViewBox(vb);
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
    }

    panToFit({ duration = 500, padding = 52 } = {}) {
      const visible = this.layoutNodes.filter((n) => {
        const s = this.nodeState[n.data.id];
        return !s || !s.concealed;
      });
      const vb = this._boundsFromLayoutNodes(
        visible.length ? visible : this.layoutNodes,
        padding
      );
      return this._animateViewBox(vb, duration);
    }

    /** Fit bounds into a viewBox that matches the stage aspect ratio */
    _fitBoundsToAspect(bounds, padding = 48, focusBounds = null) {
      const [bx, by, bw, bh] = bounds;
      const aspect = this.width / this.height || 1.1;
      let w = bw + padding * 2;
      let h = bh + padding * 2;
      if (w / h > aspect) {
        h = w / aspect;
      } else {
        w = h * aspect;
      }

      let cx = bx + bw / 2;
      let cy = by + bh / 2;
      if (focusBounds) {
        const fx = focusBounds[0] + focusBounds[2] / 2;
        const fy = focusBounds[1] + focusBounds[3] / 2;
        cx = cx * 0.65 + fx * 0.35;
        cy = cy * 0.65 + fy * 0.35;
      }

      let x = cx - w / 2;
      let y = cy - h / 2;
      const pad = padding * 0.5;
      if (x > bx - pad) x = bx - pad;
      if (y > by - pad) y = by - pad;
      if (x + w < bx + bw + pad) x = bx + bw + pad - w;
      if (y + h < by + bh + pad) y = by + bh + pad - h;

      return [x, y, w, h];
    }

    _panTowardFocus(current, allBounds, focusBounds, strength = 0.5) {
      const [cx, cy, cw, ch] = current;
      const focusCx = focusBounds[0] + focusBounds[2] / 2;
      const focusCy = focusBounds[1] + focusBounds[3] / 2;
      const viewCx = cx + cw / 2;
      const viewCy = cy + ch / 2;

      let nx = cx + (focusCx - viewCx) * strength;
      let ny = cy + (focusCy - viewCy) * strength;

      const [ax, ay, aw, ah] = allBounds;
      const pad = 10;
      if (nx > ax - pad) nx = ax - pad;
      if (ny > ay - pad) ny = ay - pad;
      if (nx + cw < ax + aw + pad) nx = ax + aw + pad - cw;
      if (ny + ch < ay + ah + pad) ny = ay + ah + pad - ch;

      return [nx, ny, cw, ch];
    }

    /**
     * Smart auto-pan: zooms out when the tree outgrows the frame, otherwise
     * gently pans toward focus nodes (e.g. pending insert slot) without zooming in.
     */
    ensureVisible({ padding = 48, duration = 400, focusNodeIds = [] } = {}) {
      const visibleNodes = this.layoutNodes.filter((n) => {
        const s = this.nodeState[n.data.id];
        return !s?.concealed;
      });
      if (!visibleNodes.length) return Promise.resolve();

      const allBounds = this._boundsFromLayoutNodes(visibleNodes, padding);
      const current = this.cameraViewBox?.slice();

      const focusNodes = focusNodeIds.length
        ? visibleNodes.filter((n) => focusNodeIds.includes(n.data.id))
        : [];
      const focusBounds = focusNodes.length
        ? this._boundsFromLayoutNodes(focusNodes, padding * 0.45)
        : null;

      let target;
      if (!current) {
        target = this._fitBoundsToAspect(allBounds, padding, focusBounds);
      } else if (!this._boundsContains(current, allBounds, 6)) {
        target = this._fitBoundsToAspect(allBounds, padding, focusBounds);
      } else if (focusBounds) {
        target = this._panTowardFocus(current, allBounds, focusBounds);
      } else {
        return Promise.resolve();
      }

      if (current && this._viewBoxChange(current, target) < 4) {
        return Promise.resolve();
      }

      return this._animateViewBox(target, duration);
    }

    panToNode(nodeId, { duration = 500, padding = 56, scale = 0.48 } = {}) {
      const node = this.layoutNodes.find((n) => n.data.id === nodeId);
      if (!node) return Promise.resolve();
      const content = this.contentViewBox || this.viewBox;
      const focusW = content[2] * scale;
      const aspect = this.width / this.height || 1.1;
      const focusH = focusW / aspect;
      const vb = [
        node.x - focusW / 2,
        node.y - focusH / 2 - padding * 0.15,
        focusW,
        focusH,
      ];
      return this._animateViewBox(vb, duration);
    }

    highlightNode(nodeId = null) {
      Object.keys(this.nodeState).forEach((id) => {
        this.nodeState[id].highlight = nodeId != null && id === nodeId;
        this._syncNode(id);
      });
    }

    _render() {
      this._layout();
      const savedCamera = this.cameraViewBox?.slice();
      this.container.innerHTML = "";

      const displayVb = this.layoutOpts.camera
        ? savedCamera || this.contentViewBox.slice()
        : this.viewBox;

      if (this.layoutOpts.camera) this.cameraViewBox = displayVb.slice();

      const svg = global.d3
        .select(this.container)
        .append("svg")
        .attr("class", "tree-diagram__svg level-tree")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", displayVb.join(" "))
        .attr("preserveAspectRatio", "xMidYMid meet")
        .attr("role", "img")
        .style("display", "block");

      const edgesG = svg.append("g").attr("class", "tree-edges");
      const nodesG = svg.append("g").attr("class", "tree-nodes");

      const linkSel = edgesG
        .selectAll("line")
        .data(this.layoutLinks, (d) => linkId(d.source.data.id, d.target.data.id))
        .join("line")
        .attr("class", (d) => this._linkClass(d))
        .attr("id", (d) => `edge-${linkId(d.source.data.id, d.target.data.id)}`)
        .each((d, i, nodes) => {
          const pts = this._linkEndpoints(d.source, d.target);
          const el = nodes[i];
          el.setAttribute("x1", pts.x1);
          el.setAttribute("y1", pts.y1);
          el.setAttribute("x2", pts.x2);
          el.setAttribute("y2", pts.y2);
        });

      linkSel.each((d) => {
        const id = linkId(d.source.data.id, d.target.data.id);
        this.linkById.set(id, global.d3.select(linkSel.nodes().find((n) => n.id === `edge-${id}`)));
      });

      const nodeSel = nodesG
        .selectAll("g")
        .data(this.layoutNodes, (d) => d.data.id)
        .join("g")
        .attr("class", (d) => this._nodeClass(d))
        .attr("id", (d) => (d.data.id === "root" ? "tree-root" : `node-${d.data.id}`))
        .attr("transform", (d) => `translate(${d.x}, ${d.y})`);

      nodeSel.each((d, i, nodes) => {
        const g = global.d3.select(nodes[i]);
        const r = d.data.id === "root" ? ROOT_R : NODE_R;
        const ringR = r + RING_PAD;

        g.selectAll("*").remove();

        g.append("circle")
          .attr("class", "tree-node__ring")
          .attr("cx", 0)
          .attr("cy", 0)
          .attr("r", ringR);

        g.append("circle")
          .attr("class", "tree-node__shadow")
          .attr("cx", SHADOW_OFF)
          .attr("cy", SHADOW_OFF)
          .attr("r", r);

        g.append("circle")
          .attr("class", "tree-node__circle")
          .attr("cx", 0)
          .attr("cy", 0)
          .attr("r", r);

        g.append("text")
          .attr("class", "tree-node__label")
          .attr("text-anchor", "middle")
          .attr("dy", "0.35em")
          .attr("font-size", `${this._labelFontSize(this._nodeLabel(d.data.id), d.depth === 0)}px`)
          .text(this._nodeLabel(d.data.id));

        this.nodeById.set(d.data.id, g);
      });

      this.linkSel = linkSel;
      this.nodeSel = nodeSel;
      this.svgSel = svg;
      this._syncAll();
    }

    _nodeLabel(id) {
      const s = this.nodeState[id];
      if (!s) return "";
      if (s.pending || s.compareHidden) return "?";
      return s.label;
    }

    _labelFontSize(label, isRoot = false) {
      const len = String(label ?? "").length;
      if (len >= 3) return isRoot ? 13 : 12;
      if (len >= 2) return isRoot ? 15 : 14;
      return isRoot ? 19 : 17;
    }

    _nodeClass(d) {
      const id = d.data.id;
      const s = this.nodeState[id];
      const parts = ["tree-node"];
      if (id === "root") parts.push("tree-node--root");
      if (d.data.fillOrder != null) parts.push("tree-node--fill");
      if (s.concealed) parts.push("tree-node--concealed");
      if (s.concealed) parts.push("is-concealed");
      if (s.ghost) parts.push("tree-node--ghost");
      if (s.pending) parts.push("tree-node--pending");
      if (s.highlight) parts.push("tree-node--highlight");
      if (s.path) parts.push("tree-node--path");
      if (s.placed) parts.push("tree-node--placed");
      if (s.auto) parts.push("tree-node--auto");
      if (s.mismatch) parts.push("tree-node--mismatch");
      if (s.compareHidden) parts.push("tree-node--compare-hidden");
      if (s.compareReveal) parts.push("tree-node--compare-reveal");
      return parts.join(" ");
    }

    _linkClass(d) {
      const id = linkId(d.source.data.id, d.target.data.id);
      const s = this.linkState[id];
      const parts = ["tree-edge"];
      if (s.concealed) {
        parts.push("tree-edge--concealed", "is-concealed");
      }
      if (s.ghost) parts.push("tree-edge--ghost");
      if (s.pending && !s.building) parts.push("tree-edge--pending");
      if (s.building) parts.push("tree-edge--building");
      if (s.built) parts.push("tree-edge--built");
      return parts.join(" ");
    }

    _syncNode(id) {
      const g = this.nodeById.get(id);
      if (!g) return;
      const d = this.layoutNodes.find((n) => n.data.id === id);
      if (!d) return;
      g.attr("class", this._nodeClass(d));
      const label = this._nodeLabel(id);
      g.select(".tree-node__label")
        .attr("font-size", `${this._labelFontSize(label, d.depth === 0)}px`)
        .text(label);
    }

    _syncLink(id) {
      const el = this.container.querySelector(`#edge-${id}`);
      if (!el) return;
      const d = this.layoutLinks.find((l) => linkId(l.source.data.id, l.target.data.id) === id);
      if (!d) return;
      el.setAttribute("class", this._linkClass(d));

      const s = this.linkState[id];
      if (s.pending && !s.building && s.progress === 0) {
        el.style.strokeDasharray = "";
        el.style.strokeDashoffset = "";
      } else if (s.building && s.progress > 0 && s.progress < 1) {
        const len = this._edgeLength(el);
        el.style.strokeDasharray = `${len}`;
        el.style.strokeDashoffset = `${len * (1 - s.progress)}`;
      } else {
        el.style.strokeDasharray = "";
        el.style.strokeDashoffset = "";
      }
    }

    _syncAll() {
      Object.keys(this.nodeState).forEach((id) => this._syncNode(id));
      Object.keys(this.linkState).forEach((id) => this._syncLink(id));
    }

    _edgeLength(el) {
      const x1 = Number(el.getAttribute("x1"));
      const y1 = Number(el.getAttribute("y1"));
      const x2 = Number(el.getAttribute("x2"));
      const y2 = Number(el.getAttribute("y2"));
      return Math.hypot(x2 - x1, y2 - y1);
    }

    /* ---- Level 2 build mode ---- */

    resetBuild() {
      visitTree(this.data, (node, parentId) => {
        const show = node.id === "root";
        const ns = this.nodeState[node.id];
        ns.concealed = !show;
        ns.pending = false;
        ns.highlight = false;
        ns.path = false;
        ns.placed = node.id === "root";
        ns.auto = false;
        ns.ghost = false;
        ns.label = String(node.value);

        if (parentId) {
          const ls = this.linkState[linkId(parentId, node.id)];
          ls.concealed = !show;
          ls.pending = false;
          ls.building = false;
          ls.built = false;
          ls.ghost = false;
          ls.progress = 0;
          const el = this.container.querySelector(`#edge-${linkId(parentId, node.id)}`);
          if (el) {
            el.style.strokeDasharray = "";
            el.style.strokeDashoffset = "";
            el.classList.remove("is-build-pulse");
          }
        }
      });
      this._syncAll();
    }

    clearHighlights() {
      Object.keys(this.nodeState).forEach((id) => {
        this.nodeState[id].highlight = false;
        this.nodeState[id].path = false;
      });
      Object.keys(this.linkState).forEach((id) => {
        this.linkState[id].pending = false;
      });
      this._syncAll();
    }

    showPendingBranch(parentId, childId) {
      this.clearHighlights();

      if (!parentId && childId === "pending") {
        const cs = this.nodeState.pending;
        if (cs) {
          cs.concealed = false;
          cs.pending = true;
          cs.highlight = true;
          this._syncNode("pending");
        }
        return;
      }

      const ns = this.nodeState[parentId];
      const cs = this.nodeState[childId];
      const lid = linkId(parentId, childId);
      const ls = this.linkState[lid];

      if (!ns || !cs || !ls) return;

      ns.highlight = true;
      if (parentId === "5") {
        this.nodeState.root.path = true;
      }

      cs.concealed = false;
      cs.pending = true;
      ls.concealed = false;
      ls.pending = true;
      ls.building = false;
      ls.built = false;
      ls.ghost = false;
      ls.progress = 0;

      this._syncAll();
    }

    setLinkProgress(edgeKey, progress) {
      const ls = this.linkState[edgeKey];
      if (!ls) return;

      const clamped = Math.min(1, Math.max(0, progress));
      ls.progress = clamped;
      ls.ghost = false;

      if (clamped >= 1) {
        ls.building = false;
        ls.built = true;
        ls.pending = false;
      } else if (clamped > 0) {
        ls.building = true;
        ls.built = false;
        ls.pending = true;
      } else {
        ls.building = false;
        ls.built = false;
      }

      this._syncLink(edgeKey);

      const el = this.container.querySelector(`#edge-${edgeKey}`);
      if (!el) return;

      if (clamped >= 1) {
        el.classList.remove("tree-edge--pending", "tree-edge--building", "is-build-pulse");
        el.classList.add("tree-edge--built");
        el.style.strokeDasharray = "";
        el.style.strokeDashoffset = "";
        return;
      }

      el.classList.remove("is-build-pulse");
      void el.offsetWidth;
      el.classList.add("is-build-pulse");
      setTimeout(() => el.classList.remove("is-build-pulse"), 220);
    }

    placeNode(nodeId, { auto = false, label } = {}) {
      const ns = this.nodeState[nodeId];
      if (!ns) return;

      ns.concealed = false;
      ns.pending = false;
      ns.placed = true;
      ns.auto = auto;
      ns.ghost = false;
      if (label != null) ns.label = String(label);

      this._syncNode(nodeId);
    }

    unhighlight(nodeId) {
      if (this.nodeState[nodeId]) {
        this.nodeState[nodeId].highlight = false;
        this._syncNode(nodeId);
      }
    }

    /* ---- Level 1 fill mode ---- */

    showAllForQuestion() {
      visitTree(this.data, (node, parentId) => {
        this.nodeState[node.id].concealed = false;
        this.nodeState[node.id].ghost = false;
        this.nodeState[node.id].placed = false;
        this.nodeState[node.id].auto = false;
        if (parentId) this.linkState[linkId(parentId, node.id)].concealed = false;
      });
      this._syncAll();
    }

    setRhythmGhosts() {
      this.fillOrder.forEach((n) => {
        const ns = this.nodeState[n.id];
        ns.ghost = true;
        ns.placed = false;
        ns.auto = false;
      });
      this._syncAll();
    }

    placeFillIndex(index, { auto = false } = {}) {
      const node = this.fillOrder[index];
      if (!node) return false;
      const ns = this.nodeState[node.id];
      ns.ghost = false;
      ns.placed = true;
      ns.auto = auto;
      ns.concealed = false;
      this._syncNode(node.id);
      return true;
    }

    get fillCount() {
      return this.fillOrder.length;
    }

    resize() {
      this._measure();
      const cam = this.cameraViewBox?.slice();
      this._render();
      if (cam) this._applyViewBox(cam);
    }

    /** Replace tree data and re-render (optimal / dynamic build mode) */
    reloadData(newData, options = {}) {
      this.data = newData;
      if (options.layout) this.layoutOpts = options.layout;
      this.fillOrder = collectFillOrder(this.data);
      this.nodeState = {};
      this.linkState = {};
      this.nodeById = new Map();
      this.linkById = new Map();
      this._initState(options);
      visitTree(this.data, (node) => {
        if (node.id === "pending") return;
        const ns = this.nodeState[node.id];
        if (ns) {
          ns.placed = true;
          ns.concealed = false;
        }
      });
      const savedCamera = this.layoutOpts.camera ? this.cameraViewBox?.slice() : null;
      this._render();
      if (savedCamera) this.cameraViewBox = savedCamera;
    }

    markMismatches(nodeIds) {
      const set = new Set(nodeIds || []);
      Object.keys(this.nodeState).forEach((id) => {
        this.nodeState[id].mismatch = set.has(id);
        this._syncNode(id);
      });
    }

    clearMismatches() {
      Object.keys(this.nodeState).forEach((id) => {
        this.nodeState[id].mismatch = false;
        this._syncNode(id);
      });
    }

    prepareCompareHidden() {
      Object.keys(this.nodeState).forEach((id) => {
        const ns = this.nodeState[id];
        ns.compareHidden = true;
        ns.compareReveal = false;
        ns.mismatch = false;
        this._syncNode(id);
      });
    }

    revealCompareNode(id, label, { mismatch = false, pulseMs = 520 } = {}) {
      const ns = this.nodeState[id];
      if (!ns) return;
      ns.compareHidden = false;
      ns.compareReveal = true;
      ns.mismatch = mismatch;
      ns.placed = true;
      ns.ghost = false;
      ns.concealed = false;
      ns.label = String(label);
      this._syncNode(id);
      if (pulseMs > 0 && !global.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setTimeout(() => {
          if (this.nodeState[id]) {
            this.nodeState[id].compareReveal = false;
            this._syncNode(id);
          }
        }, pulseMs);
      }
    }

    lockCompareReveal() {
      Object.keys(this.nodeState).forEach((id) => {
        const ns = this.nodeState[id];
        ns.compareHidden = false;
        ns.compareReveal = false;
        ns.placed = true;
        this._syncNode(id);
      });
    }
  }

  global.TreeMap = TreeMap;

  global.TreeMap.LEVEL1_DATA = {
    id: "root",
    value: 8,
    fillOrder: 0,
    children: [
      {
        id: "4",
        value: 4,
        fillOrder: 1,
        children: [
          { id: "2", value: 2, fillOrder: 3 },
          { id: "6", value: 6, fillOrder: 4 },
        ],
      },
      { id: "12", value: 12, fillOrder: 2 },
    ],
  };

  global.TreeMap.TUTORIAL_L1_DATA = {
    id: "root",
    value: 8,
    children: [
      {
        id: "4",
        value: 4,
        children: [{ id: "2", value: 2 }],
      },
      { id: "12", value: 12 },
    ],
  };

  global.TreeMap.TUTORIAL_L3_DATA = {
    id: "root",
    value: 4,
    children: [
      {
        id: "g3",
        value: 3,
        branch: "left",
        children: [
          {
            id: "g2",
            value: 2,
            branch: "left",
            children: [{ id: "g1", value: 1, branch: "left" }],
          },
        ],
      },
    ],
  };

  global.TreeMap.TUTORIAL_L5_DATA = {
    id: "g42",
    value: "?",
    children: [
      {
        id: "g20",
        value: "?",
        branch: "left",
        children: [
          {
            id: "g10",
            value: "?",
            branch: "left",
            children: [
              {
                id: "g5",
                value: "?",
                branch: "left",
                children: [{ id: "g2", value: "?", branch: "left" }],
              },
              { id: "g15", value: "?", branch: "right" },
            ],
          },
          { id: "g30", value: "?", branch: "right" },
        ],
      },
      {
        id: "g68",
        value: "?",
        branch: "right",
        children: [
          {
            id: "g55",
            value: "?",
            branch: "left",
            children: [{ id: "g48", value: "?", branch: "left" }],
          },
          {
            id: "g80",
            value: "?",
            branch: "right",
            children: [{ id: "g72", value: "?", branch: "left" }],
          },
        ],
      },
    ],
  };

  global.TreeMap.TUTORIAL_L4_DATA = {
    id: "g14",
    value: "?",
    children: [
      {
        id: "g9",
        value: "?",
        branch: "left",
        children: [
          {
            id: "g7",
            value: "?",
            branch: "left",
            children: [{ id: "g3", value: "?", branch: "left" }],
          },
          { id: "g11", value: "?", branch: "right" },
        ],
      },
      {
        id: "g22",
        value: "?",
        branch: "right",
        children: [{ id: "g18", value: "?", branch: "left" }],
      },
    ],
  };

  global.TreeMap.SLANT_LAYOUT = {
    type: "slant",
    slantDx: 72,
    slantDy: 62,
    padX: 52,
    padY: 44,
  };

  /** In-game slant layout with animated camera pan */
  global.TreeMap.SLANT_GAME_LAYOUT = {
    type: "slant",
    slantDx: 72,
    slantDy: 62,
    padX: 52,
    padY: 44,
    camera: true,
  };

  /** Slant layout for Level 4 — wide leaf spacing for 7-node BST + camera */
  global.TreeMap.SLANT_GAME_LAYOUT_L4 = {
    type: "slant",
    slantDx: 78,
    slantDy: 64,
    padX: 56,
    padY: 48,
    camera: true,
  };

  /** Tutorial / modal preview — same slant as L4 gameplay, extra padding */
  global.TreeMap.TUTORIAL_L4_LAYOUT = {
    ...global.TreeMap.SLANT_GAME_LAYOUT_L4,
    camera: false,
    padX: 52,
    padY: 44,
  };

  /** Slant layout for Level 5 — 12-node BST, five levels deep */
  global.TreeMap.SLANT_GAME_LAYOUT_L5 = {
    type: "slant",
    slantDx: 80,
    slantDy: 58,
    padX: 64,
    padY: 56,
    camera: true,
  };

  global.TreeMap.TUTORIAL_L2_DATA = {
    id: "root",
    value: 8,
    children: [
      { id: "t-left", value: 5 },
      { id: "t-right", value: "?" },
    ],
  };

  global.TreeMap.scheduleResize = function scheduleResize(...maps) {
    const list = maps.filter(Boolean);
    if (!list.length) return;
    requestAnimationFrame(() => {
      list.forEach((m) => m.resize?.());
      requestAnimationFrame(() => list.forEach((m) => m.resize?.()));
    });
  };

  global.TreeMap.LEVEL2_DATA = {
    id: "root",
    value: 8,
    children: [
      {
        id: "5",
        value: 5,
        children: [
          { id: "2", value: 2 },
          { id: "6", value: 6 },
        ],
      },
      { id: "12", value: 12 },
    ],
  };
})(window);
