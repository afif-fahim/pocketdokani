import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, ApiOutcomeUnknownError, json } from "./api";
import type { Order, Payout, StockItem } from "./business-lists";
import type { Context, Section, Workspace } from "./workspace-types";
import { clearPendingActions } from "./pending-actions";

type PendingSampleAction = {
  action: "open" | "reset";
  workspaceIds: string[];
};

function pendingSampleAction(base: string): PendingSampleAction | null {
  const value = window.sessionStorage.getItem(`pd-sample-action:${base}`);
  if (!value) return null;
  try {
    const pending = JSON.parse(value) as PendingSampleAction;
    if (
      (pending.action === "open" || pending.action === "reset") &&
      Array.isArray(pending.workspaceIds) &&
      pending.workspaceIds.every((id) => typeof id === "string")
    )
      return pending;
  } catch {}
  window.sessionStorage.removeItem(`pd-sample-action:${base}`);
  return null;
}

export default function useWorkspaceSession(
  context: Context,
  requestNavigation?: (action: () => void) => void,
) {
  const base = `/api/${context}`;
  const judge = context === "judge";
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const acting = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sampleResetPending, setSampleResetPending] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [active, setActive] = useState<Workspace | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [section, setSection] = useState<Section>("orders");
  const [assistantVersion, setAssistantVersion] = useState(0);
  const [focusedOrderReference, setFocusedOrderReference] = useState<
    string | null
  >(null);
  const draftRequestId = useRef<string | null>(null);
  const visibleUrl = useRef<string | null>(null);

  const resetSampleSelection = useCallback(() => {
    setSampleResetPending(false);
    const url = new URL(window.location.href);
    url.search = "?section=orders";
    window.history.replaceState(null, "", url);
    visibleUrl.current = url.href;
    setActive(null);
    setFocusedOrderReference(null);
    setSection("orders");
    draftRequestId.current = null;
    window.sessionStorage.removeItem(`pd-draft-request:${base}`);
    // Seed orders reuse their IDs after reset. Clear recovery markers only
    // after the server reset is known to have completed.
    clearPendingActions(base);
    setAssistantVersion((version) => version + 1);
  }, [base]);

  const load = useCallback(
    async (preserveSection = false) => {
      let [items, skus, orderRecords, payoutRecords] = await Promise.all([
        api<Workspace[]>(`${base}/workspaces`),
        api<StockItem[]>(`${base}/stock`),
        api<Order[]>(`${base}/orders`),
        api<Payout[]>(`${base}/payouts`),
      ]);
      // Only legacy screenshot-only judge sessions need a seed upgrade.
      if (judge && skus.length === 0) {
        await api(`${base}/session`, { method: "POST" });
        [items, skus, orderRecords, payoutRecords] = await Promise.all([
          api<Workspace[]>(`${base}/workspaces`),
          api<StockItem[]>(`${base}/stock`),
          api<Order[]>(`${base}/orders`),
          api<Payout[]>(`${base}/payouts`),
        ]);
      }
      const pending = judge ? pendingSampleAction(base) : null;
      if (pending) {
        const sample = items.find(
          (item) => item.layout === "messenger-mobile-bubbles-v1",
        );
        if (pending.action === "reset") {
          const resetObserved =
            sample &&
            pending.workspaceIds.every(
              (id) => !items.some((item) => item.id === id),
            );
          if (!resetObserved) {
            setSampleResetPending(true);
            throw new Error(
              "The reset result is still unknown. Check shop data again, or choose Retry interrupted reset to finish that same reset safely. Other changes are blocked until its state is checked.",
            );
          }
          // Fetch business records after observing the committed reset, so a
          // parallel request from before the reset cannot restore stale rows.
          [skus, orderRecords, payoutRecords] = await Promise.all([
            api<StockItem[]>(`${base}/stock`),
            api<Order[]>(`${base}/orders`),
            api<Payout[]>(`${base}/payouts`),
          ]);
          resetSampleSelection();
          preserveSection = false;
          setNotice(
            "Sample reset confirmed from the server. You can start again.",
          );
        } else if (sample) {
          const url = new URL(window.location.href);
          url.searchParams.set("workspace", sample.id);
          url.searchParams.set("section", "conversations");
          url.searchParams.delete("order");
          window.history.replaceState(null, "", url);
          visibleUrl.current = url.href;
          setAssistantVersion((version) => version + 1);
          preserveSection = false;
          setNotice(
            "The sample is open. Its saved workspace was recovered from the server.",
          );
        } else {
          setNotice(
            "No sample is visible yet. Use Start sample order to explicitly retry opening it.",
          );
        }
        window.sessionStorage.removeItem(`pd-sample-action:${base}`);
      }
      setStock(skus);
      setOrders(orderRecords);
      setPayouts(payoutRecords);
      const query = new URLSearchParams(window.location.search);
      setFocusedOrderReference(query.get("order"));
      const id = query.get("workspace");
      let selected = id ? items.find((item) => item.id === id) || null : null;
      if (id && !selected) {
        try {
          selected = await api<Workspace>(
            `${base}/workspaces/${encodeURIComponent(id)}`,
          );
        } catch (cause) {
          if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
          query.delete("workspace");
          query.set("section", "orders");
          const url = new URL(window.location.href);
          url.search = query.toString();
          window.history.replaceState(null, "", url);
          visibleUrl.current = url.href;
          setNotice(
            "That conversation is no longer in this session. Your current shop records are shown below.",
          );
        }
      }
      setWorkspaces(
        selected && !items.some((item) => item.id === selected.id)
          ? [selected, ...items]
          : items,
      );
      setActive(selected);
      if (!preserveSection) {
        const destination = query.get("section");
        setSection(
          destination === "orders" ||
            destination === "assistant" ||
            destination === "stock" ||
            destination === "conversations"
            ? destination
            : selected
              ? "conversations"
              : "orders",
        );
      }
    },
    [base, judge, resetSampleSelection],
  );

  const clearSession = useCallback(() => {
    setSignedIn(false);
    setActive(null);
    setWorkspaces([]);
    setStock([]);
    setOrders([]);
    setPayouts([]);
    setFocusedOrderReference(null);
    draftRequestId.current = null;
    window.sessionStorage.removeItem(`pd-draft-request:${base}`);
    window.sessionStorage.removeItem(`pd-sample-action:${base}`);
    setSampleResetPending(false);
    setAssistantVersion((version) => version + 1);
  }, [base]);

  useEffect(() => {
    visibleUrl.current = window.location.href;
    let stopped = false;
    api(`${base}/session`)
      .then(async () => {
        if (stopped) return;
        setSignedIn(true);
        await load();
      })
      .catch((cause: unknown) => {
        if (stopped) return;
        if (cause instanceof ApiError && cause.status === 401) clearSession();
        else
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not open your shop. Try again.",
          );
      })
      .finally(() => {
        if (!stopped) setReady(true);
      });
    return () => {
      stopped = true;
    };
  }, [base, load, clearSession]);

  useEffect(() => {
    function restoreNavigation() {
      if (!signedIn) return;
      const destination = window.location.href;
      const current = visibleUrl.current || destination;
      if (destination === current) return;
      // The browser already moved its history cursor. Keep the displayed URL
      // with its visible editor until the unsaved-work guard accepts the move.
      window.history.replaceState(window.history.state, "", current);
      if (acting.current) {
        setNotice("Finish the current step before moving to another page.");
        return;
      }
      const applyNavigation = () => {
        window.history.replaceState(window.history.state, "", destination);
        visibleUrl.current = destination;
        void act(() => load());
      };
      if (requestNavigation) requestNavigation(applyNavigation);
      else applyNavigation();
    }
    window.addEventListener("popstate", restoreNavigation);
    return () => window.removeEventListener("popstate", restoreNavigation);
  });

  function navigate(destination: Section) {
    setSection(destination);
    const url = new URL(window.location.href);
    url.searchParams.set("section", destination);
    window.history.pushState(null, "", url);
    visibleUrl.current = url.href;
  }

  function focusOrder(reference: string) {
    setActive(null);
    setFocusedOrderReference(reference);
    setSection("orders");
    const url = new URL(window.location.href);
    url.searchParams.set("section", "orders");
    url.searchParams.set("order", reference);
    url.searchParams.delete("workspace");
    window.history.pushState(null, "", url);
    visibleUrl.current = url.href;
  }

  function chooseWorkspace(workspace: Workspace | null) {
    setActive(workspace);
    const url = new URL(window.location.href);
    if (workspace) url.searchParams.set("workspace", workspace.id);
    else url.searchParams.delete("workspace");
    url.searchParams.set("section", "conversations");
    url.searchParams.delete("order");
    setFocusedOrderReference(null);
    window.history.pushState(null, "", url);
    visibleUrl.current = url.href;
    setSection("conversations");
  }

  async function act(action: () => Promise<void>, resumeReset = false) {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // A lost reset/open response survives reload. Reconcile it using reads
      // before allowing another action to change this judge shop.
      if (judge && pendingSampleAction(base) && !resumeReset) {
        await load(true);
        setNotice((current) =>
          `${current} Review the current shop, then choose the next action.`.trim(),
        );
        return;
      }
      await action();
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 401) {
        clearSession();
        setError(
          signedIn
            ? "Your session has expired. Sign in again to continue. Saved orders and conversations are safe."
            : cause.message,
        );
      } else
        setError(
          cause instanceof Error
            ? cause.message
            : "Something went wrong. Please try again.",
        );
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }

  async function signIn(passcode: string) {
    await act(async () => {
      // An earlier start request may have succeeded despite a lost response.
      // Read the cookie-backed session before explicitly starting another one.
      try {
        await api(`${base}/session`);
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
        try {
          await api(
            `${base}/session`,
            judge ? { method: "POST" } : json("POST", { passcode }),
          );
        } catch (startError) {
          if (!(startError instanceof ApiOutcomeUnknownError)) throw startError;
          await api(`${base}/session`);
        }
      }
      setSignedIn(true);
      await load();
    });
  }

  async function signOut() {
    await act(async () => {
      await api(`${base}/session`, { method: "DELETE" });
      clearSession();
      window.history.replaceState(null, "", window.location.pathname);
      visibleUrl.current = window.location.href;
    });
  }

  async function updateSample(action: "open" | "reset", retry = false) {
    await act(async () => {
      const reset = action === "reset";
      const previous = retry ? pendingSampleAction(base) : null;
      // Read current state before an explicit retry; its original ID set is
      // reused below so the server cannot repeat an already completed reset.
      const current = await api<Workspace[]>(`${base}/workspaces`);
      const baseline = previous?.workspaceIds ?? current.map((item) => item.id);
      window.sessionStorage.setItem(
        `pd-sample-action:${base}`,
        JSON.stringify({
          action,
          workspaceIds: baseline,
        }),
      );
      let workspace: Workspace;
      try {
        workspace = await api<Workspace>(
          `${base}/example`,
          json("POST", {
            reset,
            ...(reset ? { expected_workspace_ids: baseline } : {}),
          }),
        );
      } catch (cause) {
        if (cause instanceof ApiOutcomeUnknownError) {
          await load(true);
          return;
        }
        if (reset && cause instanceof ApiError && cause.status === 409) {
          const items = await api<Workspace[]>(`${base}/workspaces`);
          if (
            items.some(
              (item) => item.layout === "messenger-mobile-bubbles-v1",
            ) &&
            baseline.every((id) => !items.some((item) => item.id === id))
          )
            resetSampleSelection();
          window.sessionStorage.removeItem(`pd-sample-action:${base}`);
          setSampleResetPending(false);
          await load(true);
          setNotice(
            "The previous reset was checked. Review the current sample shop; no second reset was performed.",
          );
          return;
        }
        if (previous?.action === "reset") {
          // A refusal of this retry (for example a rate limit) says nothing
          // about the original reset, which may still finish later.
          setSampleResetPending(true);
          throw cause;
        }
        window.sessionStorage.removeItem(`pd-sample-action:${base}`);
        setSampleResetPending(false);
        throw cause;
      }
      window.sessionStorage.removeItem(`pd-sample-action:${base}`);
      if (reset) {
        resetSampleSelection();
      } else {
        chooseWorkspace(workspace);
        setAssistantVersion((version) => version + 1);
      }
      await load(true);
      setNotice(
        reset
          ? "Sample shop reset. You can start again."
          : "Sample screenshots opened. Review them to create a draft.",
      );
    }, retry);
  }

  async function createDraft() {
    await act(async () => {
      draftRequestId.current ??=
        window.sessionStorage.getItem(`pd-draft-request:${base}`) ||
        crypto.randomUUID();
      window.sessionStorage.setItem(
        `pd-draft-request:${base}`,
        draftRequestId.current,
      );
      const workspace = await api<Workspace>(
        `${base}/order-drafts`,
        json("POST", {
          request_id: draftRequestId.current,
          values: {
            customer_name: null,
            phone: null,
            address: null,
            customer_delivery_charge: null,
            order_confirmed: null,
            lines: [],
          },
        }),
      );
      draftRequestId.current = null;
      window.sessionStorage.removeItem(`pd-draft-request:${base}`);
      chooseWorkspace(workspace);
      await load(true);
    });
  }

  async function openWorkspace(id: string) {
    chooseWorkspace(
      await api<Workspace>(`${base}/workspaces/${encodeURIComponent(id)}`),
    );
  }

  return {
    base,
    judge,
    ready,
    signedIn,
    busy,
    error,
    notice,
    setError,
    setNotice,
    workspaces,
    active,
    stock,
    orders,
    payouts,
    section,
    focusedOrderReference,
    assistantVersion,
    load,
    act,
    signIn,
    signOut,
    openSampleScreenshots: () => updateSample("open"),
    resetSampleShop: () => updateSample("reset"),
    retrySampleReset: () => updateSample("reset", true),
    sampleResetPending,
    createDraft,
    chooseWorkspace,
    openWorkspace,
    navigate,
    focusOrder,
  };
}
