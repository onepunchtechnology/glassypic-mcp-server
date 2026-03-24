import * as fs from "node:fs";
import * as path from "node:path";

export interface ResolvedInput {
  buffer: Buffer;
  filename: string;
  isUrl: boolean;
}

export function isUrl(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://");
}

export function extractFilenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const basename = path.basename(pathname);
    if (basename && path.extname(basename)) {
      return basename;
    }
    return "image";
  } catch {
    return "image";
  }
}

export async function resolveInput(input: string): Promise<ResolvedInput> {
  if (isUrl(input)) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${input} (HTTP ${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      filename: extractFilenameFromUrl(input),
      isUrl: true,
    };
  }

  const absolutePath = path.resolve(input);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  return {
    buffer: fs.readFileSync(absolutePath),
    filename: path.basename(absolutePath),
    isUrl: false,
  };
}
