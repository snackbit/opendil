export function savedDraft(id: string, fallback: string): string {
  try {
    return sessionStorage.getItem("opendil:draft:" + id) ?? fallback;
  } catch {
    return fallback;
  }
}
export function storeDraft(id: string, value: string) {
  if (value.length > 100000) return;
  try {
    sessionStorage.setItem("opendil:draft:" + id, value);
  } catch {
    /* Editing remains available without storage. */
  }
}
