"use client";

import { useEffect, useRef, useState } from "react";
import BusinessLists from "@/features/orders/business-lists";
import Assistant from "@/features/assistant/assistant";
import AppShell, { Icon } from "@/components/app-shell";
import { ImageViewerProvider } from "@/components/image-viewer";
import Conversations from "@/features/conversations/conversations";
import Welcome from "@/components/welcome";
import useWorkspaceSession from "@/features/workspace/use-workspace-session";
import type { Context } from "@/features/workspace/workspace-types";

export default function WorkspaceApp({ context }: { context: Context }) {
  return (
    <ImageViewerProvider>
      <Workspace context={context} />
    </ImageViewerProvider>
  );
}

function Workspace({ context }: { context: Context }) {
  const shop = useWorkspaceSession(context, requestLeave);
  const [dirty, setDirty] = useState(false);
  const [conversationVersion, setConversationVersion] = useState(0);
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null);
  const newOrder = useRef<HTMLDialogElement>(null);
  const leave = useRef<HTMLDialogElement>(null);
  const reset = useRef<HTMLDialogElement>(null);

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
      onReset={() => requestLeave(() => reset.current?.showModal())}
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
          {shop.sampleResetPending && (
            <button
              disabled={shop.busy}
              onClick={() => void shop.retrySampleReset()}
            >
              Retry interrupted reset · this session only
            </button>
          )}
        </div>
      )}
      {shop.notice && (
        <div className="message success" role="status">
          {shop.notice}
        </div>
      )}
      {shop.judge && shop.section === "orders" && (
        <section className="judge-guide" aria-labelledby="judge-guide-heading">
          <div className="judge-guide-head">
            <h2 id="judge-guide-heading">
              Take one order from chat to courier.
            </h2>
            <p className="judge-guide-note">Sample shop · synthetic data</p>
          </div>
          <p className="judge-guide-copy">
            Let AI read the example screenshots, review the draft and confirm
            it. Then have AI check that parcel photo and book the fake courier.
            Nothing is sent to a real customer.
          </p>
          <ol className="judge-guide-steps" aria-label="Sample walkthrough">
            <li>
              <span aria-hidden="true">01</span> Review order
            </li>
            <li>
              <span aria-hidden="true">02</span> Check parcel
            </li>
            <li>
              <span aria-hidden="true">03</span> Book fake courier
            </li>
          </ol>
          <div className="button-row">
            <button
              className="primary"
              disabled={shop.busy}
              onClick={() =>
                requestLeave(() => void shop.openSampleScreenshots())
              }
            >
              Start sample order <Icon name="arrow" />
            </button>
            <button
              disabled={shop.busy}
              onClick={() => moveToTask(() => shop.navigate("assistant"))}
            >
              Try assistant · বাংলা / English
            </button>
          </div>
          <p className="fine-print">
            Every extraction and photo check uses the real Meta models.
            Processing requires the configured service and available call
            budget. Reset sample restores only your isolated shop records.
          </p>
        </section>
      )}
      {!shop.judge && shop.section === "orders" && (
        <div className="assistant-shortcut">
          <p lang="bn">অর্ডার, স্টক বা বিক্রির খবর জানতে চান?</p>
          <button
            disabled={shop.busy}
            onClick={() => moveToTask(() => shop.navigate("assistant"))}
          >
            Ask your shop · Open Assistant <span aria-hidden="true">↗</span>
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
              const order =
                record.kind === "order"
                  ? shop.orders.find((item) => item.id === record.key)
                  : null;
              if (order) shop.focusOrder(order.reference);
              else shop.navigate(record.section);
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
          key={shop.assistantVersion}
          view={shop.section}
          orders={shop.orders}
          stock={shop.stock}
          payouts={shop.payouts}
          base={shop.base}
          busy={shop.busy}
          act={shop.act}
          onChange={() => shop.load(true)}
          selectedReference={shop.focusedOrderReference}
          onSelectOrder={shop.focusOrder}
          onOpenWorkspace={(id) =>
            requestLeave(() => void shop.act(() => shop.openWorkspace(id)))
          }
        />
      )}
      {shop.section === "conversations" && (
        <Conversations
          key={`${shop.active?.id ?? "import"}-${conversationVersion}-${shop.assistantVersion}`}
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
          onDirtyChange={setDirty}
          onConfirmed={(reference) => {
            setDirty(false);
            shop.focusOrder(reference);
          }}
        />
      )}
      <dialog ref={reset} className="task-dialog" aria-labelledby="reset-title">
        <h2 id="reset-title">Reset your sample shop?</h2>
        <p>
          This removes this judge session’s drafts, checks, fake bookings and
          assistant conversation, then restores its synthetic starting data.
          Seller records and other judge sessions stay separate. The model-call
          budget does not reset.
        </p>
        <div className="button-row">
          <button autoFocus onClick={() => reset.current?.close()}>
            Keep exploring
          </button>
          <button
            className="danger"
            disabled={shop.busy}
            onClick={() => {
              reset.current?.close();
              void shop.resetSampleShop();
            }}
          >
            Reset this sample shop
          </button>
        </div>
      </dialog>
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
            className="task-dialog-close"
          >
            <Icon name="close" />
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
            <span className="order-choice-copy">
              {shop.judge ? "Sample screenshots" : "Screenshot import"}
              <small>
                {shop.judge
                  ? "Analyze a synthetic sales conversation with AI."
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
            <span className="order-choice-copy">
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
