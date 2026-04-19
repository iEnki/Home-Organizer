import { supabase } from "../supabaseClient";

const UI_STORAGE_KEY = "__assistant_ui_config_v1";
const THREAD_STORAGE_KEY = "__assistant_threads_v1";

const isMissingRelationError = (error) => {
  const text = String(error?.message || error?.details || error?.hint || "");
  return /does not exist|relation .* does not exist|Could not find/i.test(text);
};

const readLocalJson = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeLocalJson = (key, value) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota/localStorage errors.
  }
};

const getLocalThreadState = () =>
  readLocalJson(THREAD_STORAGE_KEY, { threads: [], messages: {}, receipts: {} });

const setLocalThreadState = (value) => writeLocalJson(THREAD_STORAGE_KEY, value);

const normalizeJsonObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

export const DEFAULT_ASSISTANT_UI_CONFIG = {
  enabled: true,
  is_open: false,
  is_minimized: false,
  mobile_x: null,
  mobile_y: null,
  desktop_anchor: "right",
};

export const loadAssistantUiConfig = async (userId) => {
  if (!userId) return DEFAULT_ASSISTANT_UI_CONFIG;
  try {
    const { data, error } = await supabase
      .from("assistant_ui_config")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const local = readLocalJson(`${UI_STORAGE_KEY}:${userId}`, DEFAULT_ASSISTANT_UI_CONFIG);
      return { ...DEFAULT_ASSISTANT_UI_CONFIG, ...local };
    }
    return { ...DEFAULT_ASSISTANT_UI_CONFIG, ...data };
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.warn("assistant_ui_config konnte nicht geladen werden", error);
    }
    const local = readLocalJson(`${UI_STORAGE_KEY}:${userId}`, DEFAULT_ASSISTANT_UI_CONFIG);
    return { ...DEFAULT_ASSISTANT_UI_CONFIG, ...local };
  }
};

export const saveAssistantUiConfig = async (userId, patch) => {
  if (!userId) return { ...DEFAULT_ASSISTANT_UI_CONFIG, ...patch };
  const nextLocal = {
    ...(await loadAssistantUiConfig(userId)),
    ...patch,
  };
  writeLocalJson(`${UI_STORAGE_KEY}:${userId}`, nextLocal);

  try {
    const { data, error } = await supabase
      .from("assistant_ui_config")
      .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return { ...DEFAULT_ASSISTANT_UI_CONFIG, ...nextLocal, ...(data || {}) };
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.warn("assistant_ui_config konnte nicht gespeichert werden", error);
    }
    return nextLocal;
  }
};

export const listAssistantThreads = async (userId) => {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from("ai_chat_threads")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(12);
    if (error) throw error;
    return data || [];
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.warn("ai_chat_threads konnten nicht geladen werden", error);
    }
    return getLocalThreadState().threads.filter((thread) => thread.user_id === userId);
  }
};

export const createAssistantThread = async ({
  userId,
  householdId = null,
  title = "Neuer Chat",
  contextRoute = null,
}) => {
  if (!userId) return null;
  const localThread = {
    id: `local-thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: userId,
    household_id: householdId,
    title,
    context_route: contextRoute,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from("ai_chat_threads")
      .insert({
        user_id: userId,
        household_id: householdId,
        title,
        context_route: contextRoute,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.warn("ai_chat_thread konnte nicht angelegt werden", error);
    }
    const state = getLocalThreadState();
    state.threads = [localThread, ...state.threads.filter((thread) => thread.id !== localThread.id)];
    setLocalThreadState(state);
    return localThread;
  }
};

export const renameAssistantThread = async (threadId, userId, title) => {
  if (!threadId || !userId) return;
  try {
    const { error } = await supabase
      .from("ai_chat_threads")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", threadId)
      .eq("user_id", userId);
    if (error) throw error;
  } catch (error) {
    const state = getLocalThreadState();
    state.threads = state.threads.map((thread) =>
      thread.id === threadId ? { ...thread, title, updated_at: new Date().toISOString() } : thread,
    );
    setLocalThreadState(state);
  }
};

export const loadAssistantMessages = async (threadId) => {
  if (!threadId) return [];
  try {
    const { data, error } = await supabase
      .from("ai_chat_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.warn("ai_chat_messages konnten nicht geladen werden", error);
    }
    const state = getLocalThreadState();
    return state.messages[threadId] || [];
  }
};

export const appendAssistantMessage = async ({
  threadId,
  userId,
  role,
  content,
  payload = null,
}) => {
  if (!threadId || !userId) return null;
  const normalizedPayload = normalizeJsonObject(payload);
  const localMessage = {
    id: `local-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    thread_id: threadId,
    user_id: userId,
    role,
    content,
    payload: normalizedPayload,
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from("ai_chat_messages")
      .insert({
        thread_id: threadId,
        user_id: userId,
        role,
        content,
        payload: normalizedPayload,
      })
      .select("*")
      .single();
    if (error) throw error;
    await supabase
      .from("ai_chat_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadId)
      .eq("user_id", userId);
    return data;
  } catch (error) {
    const state = getLocalThreadState();
    state.messages[threadId] = [...(state.messages[threadId] || []), localMessage];
    state.threads = state.threads.map((thread) =>
      thread.id === threadId ? { ...thread, updated_at: new Date().toISOString() } : thread,
    );
    setLocalThreadState(state);
    return localMessage;
  }
};

export const saveAssistantActionReceipts = async ({
  threadId,
  userId,
  receipts = [],
}) => {
  if (!threadId || !userId || !Array.isArray(receipts) || receipts.length === 0) return;

  const rows = receipts.map((receipt) => ({
    thread_id: threadId,
    user_id: userId,
    household_id: receipt.household_id || null,
    domain: receipt.domain || null,
    action_kind: receipt.action_kind || "create",
    target_table: receipt.target_table || null,
    target_record_id: receipt.target_record_id || null,
    summary: receipt.summary || null,
    request_payload: normalizeJsonObject(receipt.request_payload),
    result_payload: normalizeJsonObject(receipt.result_payload),
  }));

  try {
    const { error } = await supabase.from("ai_action_receipts").insert(rows);
    if (error) throw error;
  } catch (error) {
    const state = getLocalThreadState();
    state.receipts[threadId] = [...(state.receipts[threadId] || []), ...rows];
    setLocalThreadState(state);
  }
};

export const loadAssistantActionReceipts = async (threadId) => {
  if (!threadId) return [];
  try {
    const { data, error } = await supabase
      .from("ai_action_receipts")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.warn("ai_action_receipts konnten nicht geladen werden", error);
    }
    const state = getLocalThreadState();
    return state.receipts[threadId] || [];
  }
};
