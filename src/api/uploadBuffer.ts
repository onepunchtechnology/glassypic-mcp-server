import { ApiError } from "./client.js";

interface UploadBufferParams {
  baseUrl: string;
  bytes: Buffer;
  filename: string;
  mimetype: string;
  authHeaders: Record<string, string>;
}

interface UploadBufferResult {
  temp_file_id: string;
}

export async function uploadBuffer(params: UploadBufferParams): Promise<UploadBufferResult> {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(params.bytes)], { type: params.mimetype }),
    params.filename,
  );

  const response = await fetch(`${params.baseUrl}/upload`, {
    method: "POST",
    headers: { ...params.authHeaders },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.detail || `Upload failed: ${response.status}`, response.status, body.detail, body);
  }

  return response.json();
}
