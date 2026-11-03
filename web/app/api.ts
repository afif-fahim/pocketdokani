export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export class ApiOutcomeUnknownError extends Error {
  constructor(
    public path: string,
    public method: string,
  ) {
    super(
      "The request did not finish, so its result is unknown. Your change may have been saved. Review the current records before trying again.",
    );
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const pathname = path.split("?")[0];
  const write = method !== "GET" && method !== "HEAD";
  // Assistant questions/transcription cannot change business records. Other
  // writes need reconciliation after a lost response, even after a timeout.
  const businessWrite =
    write && !/\/assistant\/(turns|transcribe)$/.test(pathname);
  const deadline = !write
    ? 20_000
    : /\/session$/.test(pathname)
      ? 60_000
      : /\/pack-checks$|\/assistant\/turns$/.test(pathname)
        ? 360_000
        : /\/voice-notes$|\/assistant\/transcribe$|\/draft$/.test(pathname) &&
            method === "POST"
          ? 180_000
          : 120_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deadline);
  try {
    const response = await fetch(path, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "X-PocketDokani-Request": "1", ...init?.headers },
    });
    let readable = true;
    const body: unknown = await response.json().catch(() => {
      readable = false;
      return null;
    });
    if (!response.ok) {
      const detail =
        body && typeof body === "object" && "detail" in body
          ? body.detail
          : null;
      // These application responses occur before draft/check/transcript writes.
      // Generic gateway failures still cannot establish whether a write saved.
      const modelRefusal =
        method === "POST" &&
        /\/(draft|pack-checks|voice-notes)$/.test(pathname) &&
        ((response.status === 503 &&
          (detail ===
            "Model calls are disabled. Ask the shop owner to configure the server." ||
            detail === "Voice notes require ffmpeg on the API server.")) ||
          (response.status === 502 &&
            (detail ===
              "The model could not complete the request. Your saved work is unchanged; try again." ||
              detail ===
                "The model returned an incomplete draft. Retry extraction; saved work is unchanged." ||
              detail ===
                "No usable transcript was returned. Try a clearer voice note.")));
      if (businessWrite && response.status >= 500 && !modelRefusal)
        throw new ApiOutcomeUnknownError(path, method);
      throw new ApiError(
        typeof detail === "string"
          ? detail
          : "The service is unavailable. Please try again.",
        response.status,
      );
    }
    if (!readable) {
      if (businessWrite) throw new ApiOutcomeUnknownError(path, method);
      throw new ApiError(
        "The service returned an unreadable response. Try again.",
        502,
      );
    }
    return body as T;
  } catch (cause) {
    if (cause instanceof ApiError || cause instanceof ApiOutcomeUnknownError)
      throw cause;
    if (businessWrite) throw new ApiOutcomeUnknownError(path, method);
    throw new Error(
      controller.signal.aborted
        ? "This step took too long. Your input is still here. Check your connection and try again."
        : "Could not connect. Your input is still here. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function json(method: string, body: object): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
