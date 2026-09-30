export const activityEndpoint =
  import.meta.env.VITE_API_URL?.trim() ||
  (import.meta.env.MODE === "pages" ? null : "/api/activity");

export function assetUrl(path) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}
