import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, json } from "./api";
import type { Order, Payout, StockItem } from "./business-lists";
import type { Context, Section, Workspace } from "./workspace-types";

export default function useWorkspaceSession(context: Context) {
  const base = `/api/${context}`;
  const judge = context === "judge";
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const acting = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [active, setActive] = useState<Workspace | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [section, setSection] = useState<Section>("orders");
  const [assistantVersion, setAssistantVersion] = useState(0);

  const load = useCallback(
    async (preserveSection = false) => {
      const [items, skus, orderRecords, payoutRecords] = await Promise.all([
        api<Workspace[]>(`${base}/workspaces`),
        api<StockItem[]>(`${base}/stock`),
        api<Order[]>(`${base}/orders`),
        api<Payout[]>(`${base}/payouts`),
      ]);
      setStock(skus);
      setOrders(orderRecords);
      setPayouts(payoutRecords);
      const query = new URLSearchParams(window.location.search);
      const id = query.get("workspace");
      const selected = id
        ? items.find((item) => item.id === id) ||
          (await api<Workspace>(`${base}/workspaces/${encodeURIComponent(id)}`))
        : null;
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
    [base],
  );

  const clearSession = useCallback(() => {
    setSignedIn(false);
    setActive(null);
    setWorkspaces([]);
    setStock([]);
    setOrders([]);
    setPayouts([]);
    setAssistantVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    let stopped = false;
    api(`${base}/session`)
      .then(async () => {
        if (stopped) return;
        // Preserve existing judge cookies while upgrading screenshot-only sessions.
        if (judge) await api(`${base}/session`, { method: "POST" });
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
  }, [base, judge, load, clearSession]);

  function navigate(destination: Section) {
    setSection(destination);
    const url = new URL(window.location.href);
    url.searchParams.set("section", destination);
    window.history.replaceState(null, "", url);
  }

  function chooseWorkspace(workspace: Workspace | null) {
    setActive(workspace);
    const url = new URL(window.location.href);
    if (workspace) url.searchParams.set("workspace", workspace.id);
    else url.searchParams.delete("workspace");
    url.searchParams.set("section", "conversations");
    window.history.replaceState(null, "", url);
    setSection("conversations");
  }

  async function act(action: () => Promise<void>) {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
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
      await api(
        `${base}/session`,
        judge ? { method: "POST" } : json("POST", { passcode }),
      );
      setSignedIn(true);
      await load();
    });
  }

  async function signOut() {
    await act(async () => {
      await api(`${base}/session`, { method: "DELETE" });
      clearSession();
      window.history.replaceState(null, "", window.location.pathname);
    });
  }

  async function openExample(reset = false) {
    await act(async () => {
      const previous = section;
      let resetId = active?.id ?? workspaces[0]?.id;
      if (reset && !resetId) {
        const example = await api<Workspace>(
          `${base}/example`,
          json("POST", {}),
        );
        resetId = example.id;
      }
      const workspace = await api<Workspace>(
        `${base}/example`,
        json("POST", {
          workspace_id: reset ? resetId : undefined,
        }),
      );
      chooseWorkspace(workspace);
      setAssistantVersion((version) => version + 1);
      await load(true);
      if (reset && previous !== "conversations") navigate(previous);
      setNotice(
        reset
          ? "Sample shop reset. You can start again."
          : "Sample screenshots opened. Review them to create a draft.",
      );
    });
  }

  async function createDraft() {
    await act(async () => {
      const workspace = await api<Workspace>(
        `${base}/order-drafts`,
        json("POST", {
          request_id: crypto.randomUUID(),
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
    assistantVersion,
    load,
    act,
    signIn,
    signOut,
    openExample,
    createDraft,
    chooseWorkspace,
    openWorkspace,
    navigate,
  };
}
