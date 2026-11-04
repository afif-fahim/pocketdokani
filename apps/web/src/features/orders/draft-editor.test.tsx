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

function Editor() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <DraftEditor
        base="/api/judge"
        workspaceId="constructed-conversation"
        stock={[]}
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
