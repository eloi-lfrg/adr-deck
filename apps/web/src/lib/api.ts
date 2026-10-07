import { t, type Locale } from '@/i18n';

export interface FileContent {
  name: string;
  content: string;
  revision: string;
}

export interface CollectionResponse {
  /** Project name (launch directory). */
  title: string;
  /** Absolute path of the decisions directory. */
  dir: string;
  /** True when the server refuses writes (`adr-deck serve`, `--read-only`). */
  readOnly?: boolean;
  files: FileContent[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new ApiError(t().api.unreachable(error instanceof Error ? error.message : String(error)), 0, {});
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(errorMessage(body, response.status), response.status, body);
  }
  return body as T;
}

/** Server errors carry a `code`, worded here in the UI language; the English `error` is the fallback. */
function errorMessage(body: Record<string, unknown>, status: number): string {
  const code = typeof body['code'] === 'string' ? body['code'] : null;
  const known = code === null ? undefined : t().api.codes[code];
  if (known !== undefined) return known;
  return typeof body['error'] === 'string' ? body['error'] : t().api.status(status);
}

/** File paths may hold a category folder (`backend/0003-x.md`): each segment is encoded on its own. */
const fileUrl = (name: string): string => `/api/adrs/${name.split('/').map(encodeURIComponent).join('/')}`;

function fileNameFrom(disposition: string | null): string {
  const encoded = /filename\*=UTF-8''([^;]+)/iu.exec(disposition ?? '')?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return /filename="([^"]+)"/iu.exec(disposition ?? '')?.[1] ?? 'adr-decisions.docx';
}

export const api = {
  listAdrs: () => request<CollectionResponse>('/api/adrs'),

  readFile: (name: string) => request<FileContent>(fileUrl(name)),

  writeFile: (name: string, content: string, revision: string) =>
    request<{ revision: string }>(fileUrl(name), {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'If-Match': `"${revision}"` },
      body: content,
    }),

  /** Downloads the .docx built from every ADR of the directory, labelled in `language`; returns the file name. */
  async downloadDocx(language: Locale): Promise<string> {
    const response = await fetch(`/api/export/docx?lang=${language}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      throw new ApiError(errorMessage(body, response.status), response.status, body);
    }
    const fileName = fileNameFrom(response.headers.get('Content-Disposition'));
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return fileName;
  },
};
