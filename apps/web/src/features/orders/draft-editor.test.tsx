import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "@/lib/api";
import type { StockItem } from "@/features/orders/business-lists";
import DraftEditor from "./draft-editor";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));

const mockApi = vi.mocked(api);
const workspacePath = "/api/judge/workspaces/constructed-conversation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function Editor({ stock = [] }: { stock?: StockItem[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <DraftEditor
        base="/api/judge"
        workspaceId="constructed-conversation"
        stock={stock}
        sources={[
          {
            id: "constructed-screenshot",
            sequence: 1,
            filename: "constructed-conversation.png",
            sha256: "0".repeat(64),
            url: "/constructed-conversation.png",
            size: 100,
            width: 100,
            height: 100,
          },
        ]}
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
      {error && <p role="alert">{error}</p>}
    </>
  );
}

function initialResponse(path: string) {
  if (path === `${workspacePath}/draft`) return null;
  if (path === `${workspacePath}/voice-notes`) return [];
  if (path === "/api/judge/session") return { model_calls_enabled: true };
  throw new Error(`Unexpected request: ${path}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
});

afterEach(cleanup);

test("voice upload does not display screenshot scanning or draft preparation", async () => {
  const upload = deferred<{ id: string; transcript: string }>();
  mockApi.mockImplementation((path, init) =>
    path === `${workspacePath}/voice-notes` && init?.method === "POST"
      ? upload.promise
      : Promise.resolve(initialResponse(path)),
  );
  const { container } = render(<Editor />);
  const extract = await screen.findByRole("button", {
    name: "Extract draft with live AI ↗",
  });
  await waitFor(() =>
    expect((extract as HTMLButtonElement).disabled).toBe(false),
  );

  fireEvent.change(screen.getByLabelText(/Optional voice note/), {
    target: {
      files: [
        new File(["constructed audio"], "note.ogg", { type: "audio/ogg" }),
      ],
    },
  });

  expect(container.querySelector(".scan")).toBeNull();
  expect(screen.queryByText(/Muse Spark reads these screenshots/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Preparing draft…" })).toBeNull();
  expect(screen.getByRole("status").textContent).toBe(
    "Transcribing voice note…",
  );

  await act(async () => {
    upload.resolve({
      id: "constructed-voice-note",
      transcript: "Constructed voice transcript",
    });
  });
  expect(
    await screen.findByText("Constructed voice transcript", { exact: false }),
  ).toBeTruthy();
  expect(container.querySelector(".scan")).toBeNull();
  expect(screen.queryByText("Transcribing voice note…")).toBeNull();
});

test("failed voice upload clears transcription status without scanning screenshots", async () => {
  const upload = deferred<unknown>();
  mockApi.mockImplementation((path, init) =>
    path === `${workspacePath}/voice-notes` && init?.method === "POST"
      ? upload.promise
      : Promise.resolve(initialResponse(path)),
  );
  const { container } = render(<Editor />);
  const extract = await screen.findByRole("button", {
    name: "Extract draft with live AI ↗",
  });
  await waitFor(() =>
    expect((extract as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.change(screen.getByLabelText(/Optional voice note/), {
    target: {
      files: [
        new File(["constructed audio"], "note.ogg", { type: "audio/ogg" }),
      ],
    },
  });

  expect(container.querySelector(".scan")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe(
    "Transcribing voice note…",
  );

  await act(async () => {
    upload.reject(new Error("Voice transcription unavailable"));
  });

  expect((await screen.findByRole("alert")).textContent).toBe(
    "Voice transcription unavailable",
  );
  expect(screen.queryByText("Transcribing voice note…")).toBeNull();
  expect(container.querySelector(".scan")).toBeNull();
  expect((extract as HTMLButtonElement).disabled).toBe(false);
});

test("draft extraction scans screenshots until the draft is ready", async () => {
  const extraction = deferred<unknown>();
  mockApi.mockImplementation((path, init) =>
    path === `${workspacePath}/draft` && init?.method === "POST"
      ? extraction.promise
      : Promise.resolve(initialResponse(path)),
  );
  const { container } = render(<Editor />);
  const extract = await screen.findByRole("button", {
    name: "Extract draft with live AI ↗",
  });
  await waitFor(() =>
    expect((extract as HTMLButtonElement).disabled).toBe(false),
  );

  fireEvent.click(extract);

  expect(container.querySelector(".scan")).not.toBeNull();
  expect(screen.getByText(/Muse Spark reads these screenshots/)).toBeTruthy();

  await act(async () => {
    extraction.resolve({
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
    });
  });

  expect(await screen.findByDisplayValue("Constructed recipient")).toBeTruthy();
  expect(container.querySelector(".scan")).toBeNull();
});

const evidence = (value: string | null, quote = "") => ({
  value,
  quote,
  screenshot_index: 1,
  voice_note_id: null,
  issue: null,
  edited: false,
});

function savedDraft({
  address = "Constructed address",
  quantity = null,
  revision = 1,
}: {
  address?: string;
  quantity?: string | null;
  revision?: number;
} = {}) {
  return {
    revision,
    content: {
      customer_name: evidence("Constructed recipient"),
      phone: evidence("01X-EXAMPLE"),
      address: evidence(address, address),
      customer_delivery_charge: evidence("80"),
      order_confirmed: evidence("true"),
      lines: [
        {
          sku: evidence("CONSTRUCTED-SKU"),
          quantity: evidence(quantity),
          unit_price: evidence("450.00", "Final price 450"),
          line_discount: evidence("10.00", "10 off"),
        },
      ],
    },
    verified_prior_payment: "0",
    payment_verified: false,
    status: "draft",
    order_reference: null,
  };
}

function serve(initial: unknown, saved?: unknown) {
  mockApi.mockImplementation((path, init) => {
    if (path === `${workspacePath}/draft` && init?.method === "PUT")
      return Promise.resolve(saved);
    if (path === `${workspacePath}/draft`) return Promise.resolve(initial);
    return Promise.resolve(initialResponse(path));
  });
}

const field = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement;
const typeInto = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const expectPrices = (price: string, discount: string) => {
  expect(field("Unit price (BDT)").value).toBe(price);
  expect(field("Line discount (BDT)").value).toBe(discount);
};

test("multi-line extracted address shows and saves with a space between lines", async () => {
  serve(savedDraft({ address: "Flat A1\nExample Road" }), savedDraft());
  render(<Editor />);

  const address = (await screen.findByLabelText(
    "Delivery address",
  )) as HTMLInputElement;
  expect(address.value).toBe("Flat A1 Example Road");
  expect(address.closest(".draft-field")?.getAttribute("data-voice")).toBe(
    "ai",
  );
  expect(screen.queryByText("Unsaved edits")).toBeNull();

  typeInto("Customer name", "Edited recipient");
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

  await screen.findByText(/Draft saved/);
  const [, save] = mockApi.mock.calls.find(
    ([, init]) => init?.method === "PUT",
  )!;
  expect(JSON.parse(save!.body as string).values.address).toBe(
    "Flat A1 Example Road",
  );
});

test("typing a quantity the model left blank keeps the extracted prices", async () => {
  serve(savedDraft());
  render(<Editor />);
  await screen.findByLabelText("Quantity");

  typeInto("Quantity", "1");
  expectPrices("450.00", "10.00");
  typeInto("Quantity", "12");
  expectPrices("450.00", "10.00");
  typeInto("Quantity", "1");
  typeInto("Quantity", "");
  typeInto("Quantity", "3");
  expectPrices("450.00", "10.00");
  expect(
    field("Unit price (BDT)")
      .closest(".draft-field")
      ?.getAttribute("data-voice"),
  ).toBe("ai");
});

test("changing a quantity the chat stated clears prices for review", async () => {
  serve(savedDraft({ quantity: "2" }));
  render(<Editor />);
  await screen.findByLabelText("Quantity");

  typeInto("Quantity", "3");

  expectPrices("", "");
});

test("changing a saved first-filled quantity clears prices for review", async () => {
  serve(savedDraft(), savedDraft({ quantity: "2", revision: 2 }));
  render(<Editor />);
  await screen.findByLabelText("Quantity");
  typeInto("Quantity", "2");
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(/Draft saved/);
  expectPrices("450.00", "10.00");

  typeInto("Quantity", "3");

  expectPrices("", "");
});

test("changing the SKU clears prices even while quantity is blank", async () => {
  serve(savedDraft());
  render(
    <Editor
      stock={[
        {
          sku: "CONSTRUCTED-OTHER",
          product_name: "Constructed product",
          variant: "Constructed variant",
          lot: "Constructed lot",
          lot_received: true,
          stock_qty: 5,
          available_qty: 5,
          unit_cost: "100",
          list_price: "500",
          photo_url: null,
        },
      ]}
    />,
  );
  await screen.findByLabelText("Quantity");

  fireEvent.change(screen.getByLabelText("SKU"), {
    target: { value: "CONSTRUCTED-OTHER" },
  });

  expectPrices("", "");
});
