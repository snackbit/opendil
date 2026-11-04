export const MANIFEST: string;
export function listFiles(directory: string): Promise<string[]>;
export function readManifest(directory: string): Promise<Map<string, string>>;
export function publishDirectory(
  source: string,
  destination: string,
  options?: {
    files?: string[];
    removeStale?: boolean;
    metadata?: Record<string, unknown>;
  },
): Promise<{
  files: string[];
  bytes: number;
  removed: string[];
  kept: string[];
}>;
export function pruneUnlisted(directory: string): Promise<string[]>;
