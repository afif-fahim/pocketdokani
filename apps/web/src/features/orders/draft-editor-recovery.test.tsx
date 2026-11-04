import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DraftEditor from "@/features/orders/draft-editor";
import { ApiError, ApiOutcomeUnknownError } from "@/lib/api";
import { pendingActionKey } from "@/lib/pending-actions";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: apiMock,
}));

const path = "/api/judge/workspaces/constructed-conversation";
const pendingKey = pendingActionKey(
  "draft",
  "/api/judge",
  "constructed-conversation",
);
const draft = {
  revision: 1,
  content: {
    customer_name: { value: "Constructed recipient" },
    phone: { value: "01X-EXAMPLE" },
    address: { value: "Constructed address" },
    customer_delivery_charge: { value: "80" },
    order_confirmed: { value: "true" },
    lines: [],
  },
  verified_prior_payment: "0",
  payment_verified: false,
  status: "draft",
  order_reference: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function Editor() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      {error && <p>{error}</p>}
      <DraftEditor
        base="/api/judge"
        workspaceId="constructed-conversation"
        stock={[]}
        busy={busy}
        act={async (action) => {
          setBusy(true);
          setError("");
          try {
            await action();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Request failed");
          } finally {
            setBusy(false);
          }
        }}
        onSource={() => {}}
        onChange={async () => {}}
        onConfirmed={() => {}}
      />
    </>
  );
}

function mockRequests(
  request: Promise<typeof draft>,
  initial: typeof draft | null = null,
) {
  apiMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === `${path}/draft`)
      return init?.method === "POST" || init?.method === "PUT"
        ? request
        : initial;
    if (url === `${path}/voice-notes`) return [];
    if (url === "/api/judge/session") return { model_calls_enabled: true };
    throw new Error(`Unexpected request: ${url}`);
  });
}

async function startDraft() {
  const extract = await screen.findByRole("button", {
    name: "Extract draft with live AI ↗",
  });
  fireEvent.click(extract);
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("draft request recovery", () => {
  it("keeps an in-flight request pending without reporting a lost response", async () => {
    const request = deferred<typeof draft>();
    mockRequests(request.promise);
    render(<Editor />);
    await startDraft();

    expect(window.sessionStorage.getItem(pendingKey)).not.toBeNull();
    expect(screen.queryByText(/The response was lost/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Check saved draft" }),
    ).toBeNull();

    await act(async () => request.resolve(draft));

    expect(
      ((await screen.findByLabelText("Customer name")) as HTMLInputElement)
        .value,
    ).toBe("Constructed recipient");
    expect(window.sessionStorage.getItem(pendingKey)).toBeNull();
  });

  it("retains the recovery warning and marker after an actually lost response", async () => {
    const request = deferred<typeof draft>();
    mockRequests(request.promise);
    render(<Editor />);
    await startDraft();

    await act(async () =>
      request.reject(new ApiOutcomeUnknownError(`${path}/draft`, "POST")),
    );

    await screen.findByText(/The response was lost/);
    expect(
      screen.getByRole("button", { name: "Check saved draft" }),
    ).not.toBeNull();
    expect(
      (screen.getByLabelText(/Optional voice note/) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(window.sessionStorage.getItem(pendingKey)).not.toBeNull();
  });

  it("keeps recovery in memory when session storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is unavailable", "SecurityError");
    });
    const request = deferred<typeof draft>();
    mockRequests(request.promise);
    render(<Editor />);
    await startDraft();

    await act(async () =>
      request.reject(new ApiOutcomeUnknownError(`${path}/draft`, "POST")),
    );

    await screen.findByText(/The response was lost/);
    expect(
      (screen.getByLabelText(/Optional voice note/) as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });

  it("keeps an ordinary save pending without reporting a lost response", async () => {
    const request = deferred<typeof draft>();
    mockRequests(request.promise, draft);
    render(<Editor />);
    fireEvent.change(await screen.findByLabelText("Customer name"), {
      target: { value: "Edited recipient" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(window.sessionStorage.getItem(pendingKey)).not.toBeNull();
    expect(screen.queryByText(/The response was lost/)).toBeNull();

    await act(async () =>
      request.resolve({
        ...draft,
        revision: 2,
        content: {
          ...draft.content,
          customer_name: { value: "Edited recipient" },
        },
      }),
    );

    await screen.findByText("Draft saved. Review and confirm when ready.");
    expect(window.sessionStorage.getItem(pendingKey)).toBeNull();
  });

  it("clears the recovery marker when the server explicitly rejects the request", async () => {
    const request = deferred<typeof draft>();
    mockRequests(request.promise);
    render(<Editor />);
    await startDraft();

    await act(async () =>
      request.reject(new ApiError("Models are unavailable", 503)),
    );

    await screen.findByText("Models are unavailable");
    expect(screen.queryByText(/The response was lost/)).toBeNull();
    expect(window.sessionStorage.getItem(pendingKey)).toBeNull();
  });

  it("shows recovery for a pending marker restored after a reload", async () => {
    window.sessionStorage.setItem(
      pendingKey,
      JSON.stringify({ revision: null, status: null }),
    );
    mockRequests(new Promise(() => {}));
    render(<Editor />);

    await screen.findByRole("button", { name: "Check saved draft" });
    expect(
      (screen.getByLabelText(/Optional voice note/) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    await waitFor(() => {
      const extract = screen.getByRole("button", {
        name: "Extract draft with live AI ↗",
      }) as HTMLButtonElement;
      expect(extract.disabled).toBe(true);
    });
  });
});
