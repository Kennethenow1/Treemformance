/**
 * Card choice input — move focus + confirm together (scheme-aware).
 */
(function initLevelChoiceInput(global) {
  const held = { confirmA: false, confirmB: false };

  function getChoiceKeys() {
    return global.ControlSettings?.getChoiceKeys?.() ?? {
      up: "ArrowUp",
      down: "ArrowDown",
      confirmA: "ArrowLeft",
      confirmB: "ArrowRight",
    };
  }

  function getChoiceHint() {
    return global.ControlSettings?.getChoiceHint?.() ?? "↑ ↓ move · ← + → together to confirm";
  }

  function getVisibleCards(cards) {
    return [...cards].filter((c) => !c.hidden && !c.disabled);
  }

  function createNavigator({ cards, getIsActive, onPick }) {
    let focusIndex = 0;
    let confirmArmed = false;
    let wired = false;

    function clearHeld() {
      held.confirmA = false;
      held.confirmB = false;
      confirmArmed = false;
    }

    function clearFocus() {
      cards.forEach((c) => c.classList.remove("is-focused"));
    }

    function getFocusable() {
      return getVisibleCards(cards);
    }

    function setFocus(nextIndex) {
      const visible = getFocusable();
      if (!visible.length) return null;
      const prev = focusIndex;
      focusIndex = ((nextIndex % visible.length) + visible.length) % visible.length;
      clearFocus();
      visible[focusIndex].classList.add("is-focused");
      if (prev !== focusIndex) {
        global.LevelFeedback?.onCardFocus?.(focusIndex);
      }
      return visible[focusIndex];
    }

    function resetFocus() {
      focusIndex = 0;
      clearFocus();
      clearHeld();
      const visible = getFocusable();
      if (visible.length) {
        visible[0].classList.add("is-focused");
        global.LevelFeedback?.onCardFocus?.(0);
      }
    }

    function tryConfirm() {
      if (!getIsActive()) return;
      if (!held.confirmA || !held.confirmB) return;
      if (confirmArmed) return;

      const visible = getFocusable();
      const card = visible[focusIndex];
      if (!card) return;

      confirmArmed = true;
      global.LevelFeedback?.onCardConfirm?.();
      onPick(card);
    }

    function onKeyDown(e) {
      if (!getIsActive()) return;
      const keys = getChoiceKeys();

      if (e.code === keys.up) {
        e.preventDefault();
        setFocus(focusIndex - 1);
        return;
      }

      if (e.code === keys.down) {
        e.preventDefault();
        setFocus(focusIndex + 1);
        return;
      }

      if (e.code === keys.confirmA || e.code === keys.confirmB) {
        e.preventDefault();
        if (e.code === keys.confirmA && !held.confirmA) {
          held.confirmA = true;
          tryConfirm();
        }
        if (e.code === keys.confirmB && !held.confirmB) {
          held.confirmB = true;
          tryConfirm();
        }
      }
    }

    function onKeyUp(e) {
      const keys = getChoiceKeys();
      if (e.code === keys.confirmA) held.confirmA = false;
      if (e.code === keys.confirmB) held.confirmB = false;
      if (!held.confirmA && !held.confirmB) confirmArmed = false;
    }

    function wire() {
      if (wired) return;
      wired = true;
      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("keyup", onKeyUp);
      global.addEventListener("control-scheme:change", clearHeld);
    }

    return {
      wire,
      resetFocus,
      clearFocus,
      resetHeld: clearHeld,
    };
  }

  const dualKeyHandlers = [];
  let dualKeyWired = false;

  function attachDualKeyConfirm({ getIsActive, onConfirm }) {
    const handler = {
      getIsActive,
      onConfirm,
      held: { confirmA: false, confirmB: false },
      armed: false,
    };
    dualKeyHandlers.push(handler);

    if (!dualKeyWired) {
      dualKeyWired = true;
      document.addEventListener("keydown", onDualKeyDown);
      document.addEventListener("keyup", onDualKeyUp);
      global.addEventListener("control-scheme:change", resetAllDualKeyHeld);
    }

    return () => {
      const index = dualKeyHandlers.indexOf(handler);
      if (index >= 0) dualKeyHandlers.splice(index, 1);
      resetDualKeyHeld(handler);
    };
  }

  function getActiveDualKeyHandler() {
    for (let i = dualKeyHandlers.length - 1; i >= 0; i -= 1) {
      if (dualKeyHandlers[i].getIsActive?.()) return dualKeyHandlers[i];
    }
    return null;
  }

  function resetDualKeyHeld(handler) {
    handler.held.confirmA = false;
    handler.held.confirmB = false;
    handler.armed = false;
  }

  function resetAllDualKeyHeld() {
    dualKeyHandlers.forEach(resetDualKeyHeld);
  }

  function tryDualKeyConfirm(handler) {
    if (!handler || handler.armed) return;
    if (!handler.held.confirmA || !handler.held.confirmB) return;
    handler.armed = true;
    global.LevelFeedback?.onCardConfirm?.();
    handler.onConfirm?.();
  }

  function onDualKeyDown(e) {
    const handler = getActiveDualKeyHandler();
    if (!handler) return;
    const keys = getChoiceKeys();

    if (e.code !== keys.confirmA && e.code !== keys.confirmB) return;
    e.preventDefault();

    if (e.code === keys.confirmA && !handler.held.confirmA) {
      handler.held.confirmA = true;
      tryDualKeyConfirm(handler);
    }
    if (e.code === keys.confirmB && !handler.held.confirmB) {
      handler.held.confirmB = true;
      tryDualKeyConfirm(handler);
    }
  }

  function onDualKeyUp(e) {
    const keys = getChoiceKeys();
    if (e.code !== keys.confirmA && e.code !== keys.confirmB) return;

    dualKeyHandlers.forEach((handler) => {
      if (e.code === keys.confirmA) handler.held.confirmA = false;
      if (e.code === keys.confirmB) handler.held.confirmB = false;
      if (!handler.held.confirmA && !handler.held.confirmB) handler.armed = false;
    });
  }

  function waitForConfirmOrClick({ getIsActive, clickTarget }) {
    return new Promise((resolve) => {
      if (!clickTarget) {
        resolve();
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        detach?.();
        clickTarget.removeEventListener("click", onClick);
        resolve();
      };
      const onClick = () => finish();
      clickTarget.addEventListener("click", onClick, { once: true });
      const detach = attachDualKeyConfirm({ getIsActive, onConfirm: finish });
      clickTarget.focus();
    });
  }

  global.LevelChoiceInput = {
    get CHOICE_HINT() {
      return getChoiceHint();
    },
    getChoiceHint,
    createNavigator,
    attachDualKeyConfirm,
    waitForConfirmOrClick,
  };
})(window);
