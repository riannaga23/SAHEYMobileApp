export function createDistressEmailHandler(options?: {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}): (request: Request) => Promise<Response>;
export function configuration(env: Record<string, string | undefined>): {
  key: string; from: string;
};
