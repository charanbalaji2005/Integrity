import { API_BASE_URL, apiFetch } from "../../../utils/api-client";

export interface FileMeta {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface CourseSummary {
  id: string;
  code: string;
  name: string;
  subject: string | null;
  department: string | null;
  owner: { id: string; name: string };
  _count: { syllabi: number; materials: number; assessments: number };
}

export interface CourseTopic {
  id: string;
  title: string;
  order: number;
}

export interface CourseUnit {
  id: string;
  number: number;
  title: string;
  order: number;
  topics: CourseTopic[];
}

export interface Syllabus {
  id: string;
  title: string;
  isOfficial: boolean;
  status: "processing" | "ready" | "failed" | "manual";
  statusMessage: string | null;
  uploadedById: string;
  createdAt: string;
  file: FileMeta | null;
  units: CourseUnit[];
  _count: { assessments: number };
}

export interface CourseMaterial {
  id: string;
  kind: "pdf" | "notes" | "slides" | "reference" | "video" | "link";
  title: string;
  description: string | null;
  url: string | null;
  uploadedById: string;
  createdAt: string;
  file: FileMeta | null;
  _count: { assessments: number };
}

export interface CourseDetail extends CourseSummary {
  ownerId: string;
  syllabi: Syllabus[];
  materials: CourseMaterial[];
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) throw new ApiError(body?.message || `Request failed (${res.status})`, res.status, body?.data);
  return body?.data as T;
}

export const coursesApi = {
  list: () => request<CourseSummary[]>("/api/courses"),
  get: (id: string) => request<CourseDetail>(`/api/courses/${id}`),
  create: (input: { code: string; name: string; subject?: string; department?: string }) =>
    request<CourseSummary>("/api/courses", { method: "POST", body: JSON.stringify(input) }),
  createManualSyllabus: (courseId: string, title: string) =>
    request<Syllabus>(`/api/courses/${courseId}/syllabi/manual`, { method: "POST", body: JSON.stringify({ title }) }),
  saveStructure: (syllabusId: string, units: { id?: string; title: string; topics: { id?: string; title: string }[] }[]) =>
    request<null>(`/api/courses/syllabi/${syllabusId}/structure`, { method: "PUT", body: JSON.stringify({ units }) }),
  deleteSyllabus: (syllabusId: string) => request<null>(`/api/courses/syllabi/${syllabusId}`, { method: "DELETE" }),
  createLinkMaterial: (courseId: string, input: { kind: "video" | "link"; title: string; description?: string; url: string }) =>
    request<CourseMaterial>(`/api/courses/${courseId}/materials`, {
      method: "POST",
      body: (() => {
        const fd = new FormData();
        Object.entries(input).forEach(([k, v]) => v != null && fd.append(k, v));
        return fd;
      })(),
    }),
  updateMaterial: (materialId: string, input: { title?: string; description?: string | null; url?: string }) =>
    request<CourseMaterial>(`/api/courses/materials/${materialId}`, {
      method: "PATCH",
      body: (() => {
        const fd = new FormData();
        Object.entries(input).forEach(([k, v]) => v !== undefined && fd.append(k, v === null ? "" : v));
        return fd;
      })(),
    }),
  deleteMaterial: (materialId: string) => request<null>(`/api/courses/materials/${materialId}`, { method: "DELETE" }),
};

export const assessmentsApi = {
  loadBuilder: (id: string) => request<any>(`/api/assessments/${id}/builder`),
  create: (payload: unknown) => request<any>("/api/assessments", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: unknown) =>
    request<any>(`/api/assessments/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  publish: (id: string) => request<any>(`/api/assessments/${id}/publish`, { method: "POST" }),
  publishCheck: (id: string) =>
    request<{ ready: boolean; issues: { field: string; message: string }[] }>(`/api/assessments/${id}/publish-check`),
};

/**
 * Multipart upload with progress events (fetch has no upload progress).
 * Uses the same credentials as apiFetch: session cookie plus bearer token fallback.
 */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress: (pct: number) => void,
  method: "POST" | "PATCH" = "POST",
): { promise: Promise<{ data: T; message: string }>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<{ data: T; message: string }>((resolve, reject) => {
    xhr.open(method, `${API_BASE_URL}${path}`);
    xhr.withCredentials = true;
    const token = localStorage.getItem("auth_token");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve({ data: body?.data as T, message: body?.message ?? "" });
      else reject(new ApiError(body?.message || `Upload failed (${xhr.status})`, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("Network error while uploading.", 0));
    xhr.onabort = () => reject(new ApiError("Upload cancelled.", 0));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

/* Client-side file rules (the server enforces the same limits and checks file signatures). */
const MB = 1024 * 1024;
export const FILE_RULES = {
  syllabus: { exts: ["pdf", "docx"], max: 10 * MB, label: "PDF or DOCX, up to 10 MB", accept: ".pdf,.docx" },
  material: {
    exts: ["pdf", "doc", "docx", "ppt", "pptx", "txt", "md"],
    max: 25 * MB,
    label: "PDF, DOC/DOCX, PPT/PPTX, TXT or MD, up to 25 MB",
    accept: ".pdf,.doc,.docx,.ppt,.pptx,.txt,.md",
  },
  image: { exts: ["png", "jpg", "jpeg", "webp", "gif"], max: 5 * MB, label: "PNG, JPG, WEBP or GIF, up to 5 MB", accept: "image/png,image/jpeg,image/webp,image/gif" },
} as const;

export function checkFile(file: File, rule: (typeof FILE_RULES)[keyof typeof FILE_RULES]): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!(rule.exts as readonly string[]).includes(ext)) return `${file.name}: unsupported type. Allowed: ${rule.label}.`;
  if (file.size > rule.max) return `${file.name}: too large. Allowed: ${rule.label}.`;
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

/** Suggests a material kind from the file extension. */
export function kindForFile(name: string): CourseMaterial["kind"] {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "ppt" || ext === "pptx") return "slides";
  if (ext === "pdf") return "pdf";
  if (ext === "txt" || ext === "md") return "notes";
  return "reference";
}
