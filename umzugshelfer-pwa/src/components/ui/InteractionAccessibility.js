import { useEffect } from "react";
import { useTranslation } from "react-i18next";

const SELECTOR = '.mobile-modal-overlay, [data-app-dialog], [role="dialog"][aria-modal="true"]';
const FOCUSABLE = 'button:not(:disabled),a[href],input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';
const visible = (el) => !el.hidden && !el.closest('[inert]') && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden" && (el.getClientRects().length > 0);

/** One overlay stack for shared and explicitly marked legacy dialogs, including portalled selects. */
export function installInteractionAccessibility({ closeLabel = "Close", dialogLabel = "Dialog" } = {}) {
  const records = new Map();
  const inertBefore = new Map();
  let stack = [];
  let queued = false;
  let disposed = false;
  let id = 0;
  let lastTrigger = document.activeElement;
  const rememberTrigger = event => { lastTrigger = event.target.closest?.("button,a,input,[tabindex]") || document.activeElement; };
  const restoreInert = () => { inertBefore.forEach((value, el) => { el.inert = value; }); inertBefore.clear(); };
  const focusables = (root) => {
    // Scope each selector group to its container and count nested portal controls once.
    const containers = [root, ...document.querySelectorAll("[data-overlay-portal]")];
    return [...new Set(containers.flatMap(container => [...container.querySelectorAll(FOCUSABLE)]))]
      .filter(el => visible(el) && el.getAttribute("tabindex") !== "-1" && getComputedStyle(el).opacity !== "0");
  };
  const focus = (root) => (focusables(root).find(el => el.autofocus) || focusables(root)[0] || root).focus({ preventScroll: true });
  const sync = () => {
    queued = false;
    if (disposed) return;
    restoreInert();
    const candidates = [...document.querySelectorAll(SELECTOR)].filter(el => visible(el));
    // The wrapper owns the scrim and content. Ignore its duplicate inner role.
    const roots = candidates.filter(el => el.hasAttribute("data-app-dialog") || !candidates.some(parent => parent !== el && parent.hasAttribute("data-app-dialog") && parent.contains(el)));
    const removed = [...records.keys()].filter(el => !roots.includes(el));
    let returnTo = null;
    removed.reverse().forEach(el => { returnTo = records.get(el).trigger || returnTo; el.style.zIndex = records.get(el).zIndex; records.delete(el); });
    const added = [];
    roots.forEach(el => {
      if (records.has(el)) return;
      const layer = Math.max(120, Number(getComputedStyle(el).zIndex) || 0, ...[...records.keys()].map(root => (Number(getComputedStyle(root).zIndex) || 0) + 1));
      records.set(el, { trigger: el.contains(document.activeElement) ? lastTrigger : document.activeElement, zIndex: el.style.zIndex });
      el.style.zIndex = String(layer);
      added.push(el);
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.tabIndex = -1;
      if (!el.hasAttribute("aria-labelledby") && !el.hasAttribute("aria-label")) {
        const title = el.querySelector("h1,h2,h3");
        if (title) { if (!title.id) title.id = `app-dialog-${++id}`; el.setAttribute("aria-labelledby", title.id); }
        else el.setAttribute("aria-label", dialogLabel);
      }
      el.querySelectorAll("button").forEach(button => {
        if (!button.textContent.trim() && !button.getAttribute("aria-label") && !button.title && button.querySelector('.lucide-x,.lucide-x-circle,.lucide-circle-x')) button.setAttribute("aria-label", closeLabel);
      });
    });
    stack = roots.sort((a,b) => (Number(getComputedStyle(a).zIndex) || 0) - (Number(getComputedStyle(b).zIndex) || 0));
    const top = stack[stack.length - 1];
    document.documentElement.dataset.appModalOpen = top ? "true" : "false";
    if (top) {
      // Inert siblings on the path to body, preserving both nested dialogs and select portals.
      let branch = top;
      while (branch && branch.parentElement) {
        const currentBranch = branch;
        for (const el of currentBranch.parentElement.children) {
          if (el === currentBranch || el.matches('[data-overlay-portal],[data-live-region],script,style') || el.querySelector('[data-overlay-portal]')) continue;
          if (!inertBefore.has(el)) inertBefore.set(el, el.inert);
          el.inert = true;
        }
        branch = branch.parentElement;
        if (branch === document.body) break;
      }
      if (added.includes(top) && !top.contains(document.activeElement)) focus(top);
      else if (returnTo?.isConnected && top.contains(returnTo)) returnTo.focus({ preventScroll: true });
    } else if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
  };
  const queue = () => { if (!queued) { queued = true; queueMicrotask(sync); } };
  const viewport = window.visualViewport;
  const updateViewport = () => {
    document.documentElement.style.setProperty("--visual-viewport-height", `${viewport?.height || window.innerHeight}px`);
    document.documentElement.style.setProperty("--visual-viewport-top", `${viewport?.offsetTop || 0}px`);
    queue();
  };
  updateViewport();
  window.addEventListener("resize", updateViewport);
  viewport?.addEventListener("resize", updateViewport);
  viewport?.addEventListener("scroll", updateViewport);
  const observer = new MutationObserver(queue);
  observer.observe(document.body, { childList: true, subtree: true });
  const onFocus = event => {
    if (event.target.closest(".invoice-review-body")) requestAnimationFrame(() => event.target.scrollIntoView?.({ block: "nearest" }));
    const top = stack[stack.length - 1];
    if (top && !top.contains(event.target) && !event.target.closest('[data-overlay-portal]')) focus(top);
  };
  const onKey = event => {
    const top = stack[stack.length - 1];
    if (!top) { lastTrigger = event.target; return; }
    if (event.key === "Tab") {
      const items = focusables(top);
      const index = items.indexOf(document.activeElement);
      if (!items.length || (event.shiftKey ? index <= 0 : index === items.length - 1 || index < 0)) {
        event.preventDefault();
        (items[event.shiftKey ? items.length - 1 : 0] || top).focus();
      }
    }
    const portal = document.querySelector("[data-overlay-portal]");
    if (event.key === "Escape" && portal && !event.target.closest("[data-overlay-portal]")) {
      event.stopImmediatePropagation();
      portal.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return;
    }
    if (event.key === "Escape" && !event.target.closest('[data-overlay-portal]')) {
      event.stopImmediatePropagation();
      if (top.dataset.dialogEscape === "false") return;
      const close = [...top.querySelectorAll("button")].find(el => !el.disabled && (el.querySelector('.lucide-x,.lucide-x-circle,.lucide-circle-x') || /schlie[ßs]en|close|dismiss/i.test(el.getAttribute("aria-label") || "")));
      close?.click();
    }
  };
  document.addEventListener("pointerdown", rememberTrigger, true);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("focusin", onFocus);
  sync();
  return () => { disposed = true; delete document.documentElement.dataset.appModalOpen; window.removeEventListener("resize", updateViewport); viewport?.removeEventListener("resize", updateViewport); viewport?.removeEventListener("scroll", updateViewport); observer.disconnect(); restoreInert(); records.forEach((record, el) => { el.style.zIndex = record.zIndex; }); document.removeEventListener("pointerdown", rememberTrigger, true); document.removeEventListener("keydown", onKey, true); document.removeEventListener("focusin", onFocus); };
}
export default function InteractionAccessibility() {
  const { t } = useTranslation("common");
  useEffect(() => installInteractionAccessibility({ closeLabel: t("actions.close"), dialogLabel: t("actions.details", { defaultValue: "Dialog" }) }), [t]);
  return null;
}
