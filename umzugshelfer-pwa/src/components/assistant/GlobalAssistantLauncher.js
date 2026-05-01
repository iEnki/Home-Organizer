import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Loader2,
  MessageSquarePlus,
  Mic,
  Minimize2,
  PanelRightOpen,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import useViewport from "../../hooks/useViewport";
import { useToast } from "../../hooks/useToast";
import { useLocale } from "../../contexts/LocaleContext";
import { DEFAULT_BUDGET_VIEW_STATE, sanitizeBudgetViewState } from "../../utils/budgetViewState";
import { startSpeechRecognition } from "../../utils/kiClient";
import { getActiveHouseholdId, supabase } from "../../supabaseClient";
import {
  answerSemanticHouseholdQuestion,
  classifyAssistantInput,
  extractAssistantDomainItems,
} from "../../utils/assistantAi";
import {
  ASSISTANT_ROUTE_MAP,
  getAssistantDomainLabel,
  summarizeAssistantItems,
} from "../../utils/assistantDomains";
import {
  commitAssistantAction,
  prepareAssistantAction,
} from "../../utils/assistantDomainAdapters";
import {
  DEFAULT_ASSISTANT_UI_CONFIG,
  appendAssistantMessage,
  createAssistantThread,
  loadAssistantActionReceipts,
  listAssistantThreads,
  loadAssistantMessages,
  loadAssistantUiConfig,
  renameAssistantThread,
  saveAssistantActionReceipts,
  saveAssistantUiConfig,
} from "../../utils/assistantPersistence";

const DEFAULT_THREAD_TITLES = ["Neuer Chat", "New chat"];
const GLOBAL_ASSISTANT_ENABLED = process.env.REACT_APP_GLOBAL_ASSISTANT_ENABLED !== "false";
const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const buildOpenFlowPayload = ({ flowKey, input }) => {
  const route = ASSISTANT_ROUTE_MAP[flowKey] || "/home";
  const trimmedInput = String(input || "").trim();
  const payload = {
    type: "open_flow",
    route,
    flow_key: flowKey,
    params: {},
    ui_state: {},
  };

  if (flowKey === "rechnung_scannen") {
    payload.ui_state = { entry: "upload" };
  } else if (flowKey === "home_suche") {
    payload.params = { query: trimmedInput };
    payload.ui_state = { prefillQuery: trimmedInput };
  } else if (flowKey === "home_budget") {
    payload.params = { query: trimmedInput };
    const isSettlement =
      trimmedInput.toLowerCase().includes("ausgleich") ||
      trimmedInput.toLowerCase().includes("settlement");
    payload.ui_state = {
      targetTab: isSettlement ? "ausgleich" : "uebersicht",
      prefillState: {
        ...DEFAULT_BUDGET_VIEW_STATE,
        suchbegriff: trimmedInput,
      },
    };
  } else if (flowKey === "buchscanner") {
    payload.ui_state = {
      tab: "buecher",
      startModal: "scanner",
      scannerMode: "einzel",
    };
  }

  return payload;
};

const loadBudgetActionContext = async ({ userId, householdId, appMode, pathname }) => {
  const fallbackContext = {
    appModus: pathname === "/budget" ? "umzug" : appMode || "home",
    scopeFilter: "haushalt",
    kontoFilter: "",
    bewohnerFilter: "",
    kategFilter: "",
  };

  if (pathname !== "/home/budget" || !userId || !householdId) {
    return fallbackContext;
  }

  const { data, error } = await supabase
    .from("home_budget_view_state")
    .select("current_state")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) throw error;

  const savedState = sanitizeBudgetViewState(
    data?.current_state || DEFAULT_BUDGET_VIEW_STATE,
  );

  return {
    ...fallbackContext,
    scopeFilter: savedState.scopeFilter || "haushalt",
    kontoFilter: savedState.kontoFilter || "",
    bewohnerFilter: savedState.bewohnerFilter || "",
    kategFilter: savedState.kategFilter || "",
  };
};

const loadPacklisteActionContext = async ({ userId }) => {
  if (!userId) {
    return { kisten: [] };
  }

  const { data, error } = await supabase
    .from("pack_kisten")
    .select("id, name, raum_neu")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return {
    kisten: Array.isArray(data) ? data : [],
  };
};

const loadAssistantActionContext = async ({ domain, userId, householdId, appMode, pathname }) => {
  if (domain === "budget" || domain === "budget_split") {
    return {
      budgetContext: await loadBudgetActionContext({
        userId,
        householdId,
        appMode,
        pathname,
      }),
    };
  }

  if (domain === "packliste") {
    return loadPacklisteActionContext({ userId });
  }

  return {};
};

const GlobalAssistantLauncher = ({ session, householdContext, appMode, onRegisterOpen }) => {
  const userId = session?.user?.id;
  const householdId = householdContext?.household_id || getActiveHouseholdId() || null;
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { locale } = useLocale();
  const { isDesktop } = useViewport();
  const { t } = useTranslation(["assistant"]);

  const [uiConfig, setUiConfig] = useState(DEFAULT_ASSISTANT_UI_CONFIG);
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [pendingAction, setPendingAction] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speechActive, setSpeechActive] = useState(false);
  const panelBodyRef = useRef(null);

  const open = uiConfig.is_open === true;
  const visibleForUser = uiConfig.enabled !== false;

  const panelPositionClass =
    isDesktop && uiConfig.desktop_anchor === "left"
      ? "md:ml-6 md:mr-auto"
      : "md:mr-6 md:ml-auto";

  const persistUiConfig = useCallback(
    async (patch) => {
      if (!userId) return;
      const next = await saveAssistantUiConfig(userId, patch);
      setUiConfig((prev) => ({ ...prev, ...next }));
    },
    [userId],
  );

  const loadThreadMessages = useCallback(async (threadId) => {
    if (!threadId) {
      setMessages([]);
      setReceipts([]);
      return;
    }
    const [loadedMessages, loadedReceipts] = await Promise.all([
      loadAssistantMessages(threadId),
      loadAssistantActionReceipts(threadId),
    ]);
    setMessages(loadedMessages);
    setReceipts(loadedReceipts);
  }, []);

  const ensureThread = useCallback(async () => {
    if (activeThreadId) return activeThreadId;
    const created = await createAssistantThread({
      userId,
      householdId,
      title: t("assistant:newThreadTitle"),
      contextRoute: location.pathname,
    });
    if (!created?.id) return null;
    setThreads((prev) => [created, ...prev.filter((thread) => thread.id !== created.id)]);
    setActiveThreadId(created.id);
    setMessages([]);
    return created.id;
  }, [activeThreadId, householdId, location.pathname, t, userId]);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      if (!userId) return;
      try {
        const [storedUiConfig, storedThreads] = await Promise.all([
          loadAssistantUiConfig(userId),
          listAssistantThreads(userId),
        ]);
        if (ignore) return;
        setUiConfig(storedUiConfig);
        setThreads(storedThreads);
        if (storedThreads[0]?.id) {
          setActiveThreadId(storedThreads[0].id);
          await loadThreadMessages(storedThreads[0].id);
        }
      } catch (err) {
        if (ignore) return;
        console.error("[GlobalAssistantLauncher] Laden fehlgeschlagen:", err);
        setThreads([]);
        setMessages([]);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [loadThreadMessages, userId]);

  useEffect(() => {
    if (!open || !panelBodyRef.current) return;
    panelBodyRef.current.scrollTop = panelBodyRef.current.scrollHeight;
  }, [messages, open, pendingAction]);

  const handleOpen = useCallback(async () => {
    const threadId = await ensureThread();
    if (!threadId) return;
    setPendingAction(null);
    await persistUiConfig({ is_open: true, is_minimized: false });
  }, [ensureThread, persistUiConfig]);

  useEffect(() => {
    onRegisterOpen?.(handleOpen);
  }, [onRegisterOpen, handleOpen]);

  const handleClose = useCallback(() => {
    setPendingAction(null);
    persistUiConfig({ is_open: false, is_minimized: true });
  }, [persistUiConfig]);

  const navigateToAssistantFlow = useCallback(
    (payload) => {
      if (!payload?.route) return;
      navigate(payload.route, {
        state: {
          assistantFlow: {
            flow_key: payload.flow_key || null,
            params: isObject(payload.params) ? payload.params : {},
            ui_state: isObject(payload.ui_state) ? payload.ui_state : {},
          },
        },
      });
      handleClose();
    },
    [handleClose, navigate],
  );

  const handleNewThread = useCallback(async () => {
    const created = await createAssistantThread({
      userId,
      householdId,
      title: t("assistant:newThreadTitle"),
      contextRoute: location.pathname,
    });
    if (!created?.id) return;
    setThreads((prev) => [created, ...prev.filter((thread) => thread.id !== created.id)]);
    setActiveThreadId(created.id);
    setMessages([]);
    setReceipts([]);
    setPendingAction(null);
    setInput("");
  }, [householdId, location.pathname, t, userId]);

  const handleSelectThread = useCallback(
    async (event) => {
      const threadId = event.target.value;
      setActiveThreadId(threadId);
      setPendingAction(null);
      await loadThreadMessages(threadId);
    },
    [loadThreadMessages],
  );

  const pushMessage = useCallback(
    async (threadId, role, content, payload = null) => {
      const saved = await appendAssistantMessage({
        threadId,
        userId,
        role,
        content,
        payload,
      });
      if (saved) {
        setMessages((prev) => [...prev, saved]);
      }
      return saved;
    },
    [userId],
  );

  const maybeRenameThread = useCallback(
    async (threadId, userText) => {
      const thread = threads.find((entry) => entry.id === threadId);
      if (!thread || !DEFAULT_THREAD_TITLES.includes(thread.title)) return;
      const title = userText.trim().slice(0, 48) || t("assistant:defaultThread");
      await renameAssistantThread(threadId, userId, title);
      setThreads((prev) =>
        prev.map((entry) => (entry.id === threadId ? { ...entry, title } : entry)),
      );
    },
    [t, threads, userId],
  );

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    const threadId = await ensureThread();
    if (!threadId) return;

    setLoading(true);
    setPendingAction(null);
    setInput("");

    try {
      await pushMessage(threadId, "user", trimmed);
      await maybeRenameThread(threadId, trimmed);

      const classification = await classifyAssistantInput({
        userId,
        input: trimmed,
        appMode,
        pathname: location.pathname,
        locale,
      });

      if (classification.intent === "semantic_search") {
        const answer = await answerSemanticHouseholdQuestion({
          userId,
          householdId,
          question: trimmed,
          locale,
        });
        await pushMessage(threadId, "assistant", answer.answer, {
          type: "semantic_search",
          sources: answer.sources,
        });
        return;
      }

      if (classification.intent === "open_flow") {
        const flowPayload = buildOpenFlowPayload({
          flowKey: classification.open_flow,
          input: trimmed,
        });
        const text =
          classification.reply ||
          t("assistant:openFlowReply", { flow: classification.open_flow });
        await pushMessage(threadId, "assistant", text, flowPayload);
        setPendingAction({
          kind: "open_flow",
          flow: flowPayload,
          reply: text,
          previewText: text,
        });
        return;
      }

      if (classification.intent !== "extract_records" || !classification.domain) {
        await pushMessage(
          threadId,
          "assistant",
          classification.reply || t("assistant:uncertainReply"),
        );
        return;
      }

      const items = await extractAssistantDomainItems({
        userId,
        domain: classification.domain,
        text: trimmed,
        locale,
      });

      if (!Array.isArray(items) || items.length === 0) {
        await pushMessage(threadId, "assistant", t("assistant:noItemsExtracted"));
        return;
      }

      const actionContext = await loadAssistantActionContext({
        domain: classification.domain,
        userId,
        householdId,
        appMode,
        pathname: location.pathname,
      });

      const preparedAction = await prepareAssistantAction({
        domain: classification.domain,
        session,
        items,
        context: actionContext,
      });

      const previewText =
        classification.reply ||
        `Ich habe ${summarizeAssistantItems(classification.domain, items, t)} vorbereitet.`;
      await pushMessage(threadId, "assistant", previewText, {
        type: "prepared_action",
        domain: classification.domain,
        count: items.length,
      });

      setPendingAction({
        threadId,
        domain: classification.domain,
        preparedAction: {
          ...preparedAction,
          domain: classification.domain,
          items,
        },
        actionContext,
        previewText,
      });
    } catch (error) {
      const message = error?.message || t("assistant:errGeneric");
      toast.error(message);
      await pushMessage(threadId, "assistant", message, {
        type: "error",
        code: error?.code || null,
        provider: error?.provider || null,
        status: error?.status || null,
        retryable: Boolean(error?.retryable),
      });
    } finally {
      setLoading(false);
    }
  }, [
    appMode,
    ensureThread,
    householdId,
    input,
    loading,
    locale,
    location.pathname,
    maybeRenameThread,
    pushMessage,
    session,
    t,
    toast,
    userId,
  ]);

  const handleConfirmPending = useCallback(async () => {
    if (!pendingAction || loading) return;
    setLoading(true);
    try {
      if (pendingAction.kind === "open_flow") {
        navigateToAssistantFlow(pendingAction.flow);
        setPendingAction(null);
        return;
      }

      const result = await commitAssistantAction({
        preparedAction: pendingAction.preparedAction,
        session,
        context: pendingAction.actionContext || {},
      });
      await saveAssistantActionReceipts({
        threadId: pendingAction.threadId,
        userId,
        receipts: result.receipts,
      });
      const nextReceipts = await loadAssistantActionReceipts(pendingAction.threadId);
      setReceipts(nextReceipts);
      const summary = t("assistant:savedSummary", {
        domain: getAssistantDomainLabel(pendingAction.domain, t),
        count: result.count,
      });
      await pushMessage(pendingAction.threadId, "assistant", summary, {
        type: "commit_result",
        domain: pendingAction.domain,
        count: result.count,
      });
      toast.success(summary);
      setPendingAction(null);
    } catch (error) {
      const message = error?.message || t("assistant:errSave");
      toast.error(message);
      await pushMessage(pendingAction.threadId, "assistant", message, {
        type: "error",
        code: error?.code || null,
        provider: error?.provider || null,
        status: error?.status || null,
        retryable: Boolean(error?.retryable),
      });
    } finally {
      setLoading(false);
    }
  }, [loading, navigateToAssistantFlow, pendingAction, pushMessage, session, t, toast, userId]);

  const handleDiscardPending = useCallback(() => {
    setPendingAction(null);
  }, []);

  const handleStartSpeech = useCallback(() => {
    if (speechActive) return;
    setSpeechActive(true);
    startSpeechRecognition(
      (transcript) => {
        setSpeechActive(false);
        setInput((prev) => (prev ? `${prev} ${transcript}`.trim() : transcript));
      },
      (errorMessage) => {
        setSpeechActive(false);
        toast.error(errorMessage);
      },
      locale,
    );
  }, [locale, speechActive, toast]);

  if (!userId || !GLOBAL_ASSISTANT_ENABLED || !visibleForUser) return null;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[150] flex items-end justify-end bg-black/30 backdrop-blur-sm">
          <div className={`flex h-[min(82vh,760px)] w-full max-w-[440px] flex-col rounded-t-3xl border border-light-border bg-light-card shadow-elevation-3 dark:border-dark-border dark:bg-canvas-2 md:mb-6 md:h-[680px] md:rounded-3xl ${panelPositionClass}`}>
            <div className="flex items-center gap-2 border-b border-light-border px-4 py-3 dark:border-dark-border">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500/10 text-primary-500">
                <Sparkles size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-light-text-main dark:text-dark-text-main">
                  {t("assistant:globalTitle")}
                </p>
                <p className="truncate text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {householdContext?.household_name || t("assistant:defaultHousehold")}
                </p>
              </div>
              <button
                type="button"
                onClick={handleNewThread}
                className="rounded-full p-2 text-light-text-secondary hover:bg-light-hover dark:text-dark-text-secondary dark:hover:bg-canvas-3"
                title={t("assistant:newChat")}
              >
                <MessageSquarePlus size={16} />
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-full p-2 text-light-text-secondary hover:bg-light-hover dark:text-dark-text-secondary dark:hover:bg-canvas-3"
                title={t("assistant:minimize")}
              >
                <Minimize2 size={16} />
              </button>
              <button
                type="button"
                onClick={() => persistUiConfig({ is_open: false, is_minimized: true })}
                className="rounded-full p-2 text-light-text-secondary hover:bg-light-hover dark:text-dark-text-secondary dark:hover:bg-canvas-3"
                title={t("assistant:close")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="border-b border-light-border px-4 py-3 dark:border-dark-border">
              <select
                value={activeThreadId || threads[0]?.id || ""}
                onChange={handleSelectThread}
                className="w-full rounded-card-sm border border-light-border bg-light-bg px-3 py-2 text-sm text-light-text-main dark:border-dark-border dark:bg-canvas-1 dark:text-dark-text-main"
              >
                {threads.length === 0 && <option value="">{t("assistant:noThread")}</option>}
                {threads.map((thread) => (
                  <option key={thread.id} value={thread.id}>
                    {thread.title || t("assistant:defaultThread")}
                  </option>
                ))}
              </select>
            </div>

            <div ref={panelBodyRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 && !pendingAction && (
                <div className="rounded-card border border-dashed border-light-border p-4 text-sm text-light-text-secondary dark:border-dark-border dark:text-dark-text-secondary">
                  {t("assistant:emptyState")}
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "ml-auto bg-primary-500 text-white"
                      : "bg-light-bg text-light-text-main dark:bg-canvas-1 dark:text-dark-text-main"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.payload?.type === "open_flow" && (
                    <button
                      type="button"
                      onClick={() => navigateToAssistantFlow(message.payload)}
                      className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary-500 px-3 py-1 text-xs font-medium text-white"
                    >
                      <PanelRightOpen size={12} />
                      {t("assistant:openFlow")}
                    </button>
                  )}
                  {Array.isArray(message.payload?.sources) && message.payload.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.payload.sources.map((source) => (
                        <button
                          key={source.reference}
                          type="button"
                          onClick={() => source.documentId && navigate("/home/dokumente", { state: { focusDokumentId: source.documentId } })}
                          className="rounded-full bg-primary-500/10 px-2.5 py-1 text-xs text-primary-500"
                        >
                          {source.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {receipts.length > 0 && (
                <div className="rounded-card border border-light-border bg-light-bg/60 p-4 dark:border-dark-border dark:bg-canvas-1/60">
                  <p className="text-xs font-semibold uppercase tracking-wide text-light-text-secondary dark:text-dark-text-secondary">
                    {t("assistant:actionsLabel")}
                  </p>
                  <div className="mt-3 space-y-2">
                    {receipts.slice(0, 12).map((receipt, idx) => (
                      <div
                        key={receipt.id || `receipt-${receipt.target_table}-${idx}`}
                        className="rounded-card-sm bg-light-card px-3 py-2 text-sm dark:bg-canvas-2"
                      >
                        <p className="font-medium text-light-text-main dark:text-dark-text-main">
                          {receipt.summary || receipt.target_table || t("assistant:defaultAction")}
                        </p>
                        <p className="mt-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                          {receipt.action_kind || "create"} {receipt.target_table ? `· ${receipt.target_table}` : ""}
                          {receipt.created_at ? ` · ${new Date(receipt.created_at).toLocaleString(locale === "en-GB" ? "en-GB" : "de-AT")}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pendingAction && (
                <div className="rounded-card border border-primary-500/20 bg-primary-500/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                    {t("assistant:preview")}
                  </p>
                  <p className="mt-1 text-sm text-light-text-main dark:text-dark-text-main">
                    {pendingAction.previewText}
                  </p>
                  {(() => {
                    const pa = pendingAction.preparedAction;
                    const domain = pendingAction.domain;
                    const previewItems =
                      pa?.kind === "shopping"
                        ? (pa.prepared?.drafts || pa.previewItems || [])
                        : (pa?.items || []);
                    if (previewItems.length === 0) return null;
                    return (
                      <ul className="mt-3 space-y-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                        {previewItems.slice(0, 6).map((item, index) => {
                          let label;
                          if (domain === "buecher") label = item.titel || item.name;
                          else if (domain === "wartungen") label = `${item.geraet_name || "Gerät"}: ${item.typ || "Wartung"}`;
                          else if (domain === "budget_split") label = `${item.beschreibung || "Split"} (${item.betrag} EUR, Zahler: ${item.payer_member_name || "?"})`;
                          else if (domain === "budget_settlement") label = `${item.from_member_name || "?"} → ${item.to_member_name || "?"}: ${item.amount} EUR`;
                          else if (domain === "packliste") label = item.gegenstand || item.kiste_name || item.beschreibung;
                          else label = item.name || item.beschreibung || item.original_text || item.titel;
                          return (
                            <li key={`${domain}-preview-${index}`} className="rounded-card-sm bg-light-card px-3 py-2 dark:bg-canvas-2">
                              <span className="font-medium text-light-text-main dark:text-dark-text-main">
                                {label || `${t("assistant:defaultEntry")} ${index + 1}`}
                              </span>
                              {item.betrag && domain !== "budget_split" ? ` · ${item.betrag} EUR` : ""}
                              {item.kategorie ? ` · ${item.kategorie}` : ""}
                            </li>
                          );
                        })}
                      </ul>
                    );
                  })()}
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmPending}
                      disabled={loading}
                      className="rounded-full bg-primary-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {loading
                        ? t("assistant:saving")
                        : pendingAction.kind === "open_flow"
                          ? t("assistant:openSection")
                          : t("assistant:confirm")}
                    </button>
                    <button
                      type="button"
                      onClick={handleDiscardPending}
                      disabled={loading}
                      className="rounded-full border border-light-border px-4 py-2 text-sm text-light-text-main dark:border-dark-border dark:text-dark-text-main"
                    >
                      {t("assistant:discard")}
                    </button>
                  </div>
                </div>
              )}

              {loading && (
                <div className="inline-flex items-center gap-2 rounded-full bg-light-bg px-3 py-2 text-sm text-light-text-secondary dark:bg-canvas-1 dark:text-dark-text-secondary">
                  <Loader2 size={15} className="animate-spin" />
                  {t("assistant:working")}
                </div>
              )}
            </div>

            <div className="border-t border-light-border px-4 py-3 dark:border-dark-border">
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={handleStartSpeech}
                  disabled={speechActive || loading}
                  className="rounded-full border border-light-border p-3 text-light-text-secondary dark:border-dark-border dark:text-dark-text-secondary"
                  title={t("assistant:voice")}
                >
                  <Mic size={16} className={speechActive ? "animate-pulse text-primary-500" : ""} />
                </button>
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={2}
                  placeholder={t("assistant:placeholder")}
                  className="min-h-[48px] flex-1 resize-none rounded-2xl border border-light-border bg-light-bg px-4 py-3 text-sm text-light-text-main outline-none dark:border-dark-border dark:bg-canvas-1 dark:text-dark-text-main"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="rounded-full bg-primary-500 p-3 text-white disabled:opacity-50"
                  title={t("assistant:send")}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default GlobalAssistantLauncher;
