export const MAX_DISPLAY_NAME_LENGTH = 26;

export function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}
