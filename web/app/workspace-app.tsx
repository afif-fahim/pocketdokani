"use client";

import { useEffect, useRef, useState } from "react";
import BusinessLists from "./business-lists";
import Assistant from "./assistant";
import AppShell, { Icon } from "./app-shell";
import Conversations from "./conversations";
import Welcome from "./welcome";
import useWorkspaceSession from "./use-workspace-session";
import type { Context } from "./workspace-types";

export default function WorkspaceApp({ context }: { context: Context }) {
  const shop = useWorkspaceSession(context);
  const [dirty, setDirty] = useState(false);
  const [conversationVersion, setConversationVersion] = useState(0);
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null);
  const newOrder = useRef<HTMLDialogElement>(null);
  const leave = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!dirty) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  function requestLeave(action: () => void) {
    if (dirty) {
      setLeaveAction(() => action);
      leave.current?.showModal();
    } else action();
  }

  function startOrder(action: () => void) {
    newOrder.current?.close();
    requestLeave(() => {
      setConversationVersion((version) => version + 1);
      action();
    });
  }

  function moveToTask(action: () => void) {
    requestLeave(() => {
      action();
      requestAnimationFrame(() =>
        document.getElementById("main-content")?.focus({ preventScroll: true }),
      );
    });
  }

  if (!shop.ready || !shop.signedIn)
    return (
      <Welcome
        judge={shop.judge}
        ready={shop.ready}
        busy={shop.busy}
        error={shop.error}
        notice={shop.notice}
        onSignIn={shop.signIn}
      />
    );

  return (
    <AppShell
      judge={shop.judge}
      section={shop.section}
      busy={shop.busy}
      onNavigate={(section) => {
        if (section !== shop.section) moveToTask(() => shop.navigate(section));
      }}
      onNewOrder={() => newOrder.current?.showModal()}
      onSignOut={() => requestLeave(() => void shop.signOut())}
      onReset={() => requestLeave(() => void shop.resetSampleShop())}
    >
      {shop.error && (
        <div className="message error" role="alert">
          <p>{shop.error}</p>
          <button
            disabled={shop.busy}
            onClick={() => shop.act(() => shop.load(true))}
          >
            Reload shop data
          </button>
        </div>
      )}
      {shop.notice && (
        <div className="message success" role="status">
          {shop.notice}
        </div>
      )}
      {shop.busy && (
        <p className="working-status" role="status">
          Working… Please wait for this step to finish.
        </p>
      )}
      {shop.section === "orders" && (
        <div className="assistant-shortcut">
          <div>
            <Icon name="assistant" />
            <div>
              <strong>Ask your shop</strong>
              <p lang="bn">অর্ডার, স্টক বা বিক্রির খবর জানতে চান?</p>
            </div>
          </div>
          <button
            disabled={shop.busy}
            onClick={() => moveToTask(() => shop.navigate("assistant"))}
          >
            Open Assistant <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}
      <div hidden={shop.section !== "assistant"}>
        <Assistant
          key={shop.assistantVersion}
          base={shop.base}
          defaultAnswerLanguage={context === "judge" ? "en" : "auto"}
          busy={shop.busy}
          active={shop.section === "assistant"}
          act={shop.act}
          onChange={() => shop.load(true)}
          onDraft={async (id) => {
            await shop.openWorkspace(id);
            await shop.load(true);
          }}
          onRecord={(record) => {
            moveToTask(() => {
              shop.navigate(record.section);
              requestAnimationFrame(() => {
                const element = document.getElementById(
                  record.kind + "-" + record.key,
                );
                if (element instanceof HTMLDetailsElement) element.open = true;
                element?.closest("details")?.setAttribute("open", "");
                element?.scrollIntoView({ block: "center" });
              });
            });
          }}
        />
      </div>
      {(shop.section === "orders" || shop.section === "stock") && (
        <BusinessLists
          view={shop.section}
          orders={shop.orders}
          stock={shop.stock}
          payouts={shop.payouts}
          base={shop.base}
          busy={shop.busy}
          act={shop.act}
          onChange={() => shop.load(true)}
          onOpenWorkspace={(id) =>
            requestLeave(() => void shop.act(() => shop.openWorkspace(id)))
          }
        />
      )}
      {shop.section === "conversations" && (
        <Conversations
          key={`${shop.active?.id ?? "import"}-${conversationVersion}`}
          base={shop.base}
          judge={shop.judge}
          busy={shop.busy}
          active={shop.active}
          workspaces={shop.workspaces}
          stock={shop.stock}
          act={shop.act}
          setError={shop.setError}
          setNotice={shop.setNotice}
          onChoose={(workspace) => {
            if (workspace?.id !== shop.active?.id)
              requestLeave(() => shop.chooseWorkspace(workspace));
          }}
          onImported={async (workspace) => {
            shop.chooseWorkspace(workspace);
            await shop.load(true);
          }}
          onChange={() => shop.load(true)}
          onExample={() =>
            requestLeave(() => void shop.openSampleScreenshots())
          }
          onReset={() => requestLeave(() => void shop.resetSampleShop())}
          onDirtyChange={setDirty}
        />
      )}
      <dialog
        ref={newOrder}
        className="task-dialog"
        aria-labelledby="new-order-title"
      >
        <div className="section-heading">
          <h2 id="new-order-title">Start a new order</h2>
          <button
            onClick={() => newOrder.current?.close()}
            aria-label="Close new order choices"
          >
            ×
          </button>
        </div>
        <p>
          {shop.judge
            ? "Try the sample screenshots or enter an order yourself."
            : "Start with your chat screenshots or enter the details yourself."}
        </p>
        <div className="order-choices">
          <button
            disabled={shop.busy}
            onClick={() =>
              startOrder(() => {
                if (shop.judge) void shop.openSampleScreenshots();
                else shop.chooseWorkspace(null);
              })
            }
          >
            <Icon name="conversations" />
            <span>
              {shop.judge ? "Sample screenshots" : "Screenshot import"}
              <small>
                {shop.judge
                  ? "Review a constructed Messenger conversation."
                  : "Upload a chat, check the order and confirm."}
              </small>
            </span>
            <Icon name="arrow" />
          </button>
          <button
            disabled={shop.busy}
            onClick={() => startOrder(() => void shop.createDraft())}
          >
            <Icon name="orders" />
            <span>
              Manual draft
              <small>Add the customer, items and agreed prices.</small>
            </span>
            <Icon name="arrow" />
          </button>
        </div>
        {shop.judge && (
          <p className="fine-print">
            Sample shop · Screenshot uploads are available after seller sign-in.
          </p>
        )}
      </dialog>
      <dialog
        ref={leave}
        className="task-dialog"
        aria-labelledby="unsaved-title"
        onClose={() => setLeaveAction(null)}
      >
        <h2 id="unsaved-title">Leave your unsaved work?</h2>
        <p>
          Draft edits or selected screenshots have not been saved. Stay here to
          finish, or discard them and continue.
        </p>
        <div className="button-row">
          <button
            className="primary"
            autoFocus
            onClick={() => leave.current?.close()}
          >
            Keep editing
          </button>
          <button
            className="danger"
            onClick={() => {
              const action = leaveAction;
              leave.current?.close();
              action?.();
            }}
          >
            Discard and continue
          </button>
        </div>
      </dialog>
    </AppShell>
  );
}
