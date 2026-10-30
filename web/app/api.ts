export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "X-PocketDokani-Request": "1", ...init?.headers },
    });
  } catch {
    throw new Error("Could not connect. Check your connection and try again.");
  }
  const body = await response
    .json()
    .catch(() => ({ detail: "The service is unavailable. Please try again." }));
  if (!response.ok)
    throw new ApiError(
      typeof body.detail === "string"
        ? body.detail
        : "Check your input and try again.",
      response.status,
    );
  return body as T;
}

export function json(method: string, body: object): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
