import { ALLOWED_EXTENSIONS } from "@shared/const";

export {
  COOKIE_NAME,
  ONE_YEAR_MS,
  MAX_UPLOAD_BYTES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  isAllowedMimeType,
} from "@shared/const";

export function acceptAttribute(): string {
  return ALLOWED_EXTENSIONS.join(",");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "2h 18m" from minutes. */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
