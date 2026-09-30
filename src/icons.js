const paths = {
  arrowLeft: '<path d="M20 12H5m5-5-5 5 5 5"/>',
  arrowUpRight: '<path d="M7 17 17 7M7 7h10v10"/>',
  arrowRight: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  chevronDown: '<path d="m7 10 5 5 5-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
  plane: '<path d="m22 2-7 20-4-9L2 9Z"/><path d="m22 2-11 11"/>',
  airplane:
    '<path d="m21 4-6 7 1 9-2 1-4-7-5 2-2-2 5-4-2-7 2-1 6 5 5-5c2-2 4 0 2 2Z"/>',
  pedestrian:
    '<circle cx="13" cy="4" r="2"/><path d="m7 21 3-7m6 7-3-7V8l-3 3-4 1m7-4 3 4h4"/>',
  car: '<path d="m3 10 2-5h14l2 5v8H3Zm0 0h18M6 18v3m12-3v3M7 14h.01M17 14h.01"/>',
  bus: '<rect x="4" y="3" width="16" height="16" rx="3"/><path d="M4 11h16M8 3v8m8-8v8M7 15h1m8 0h1M7 19v2m10-2v2"/>',
  truck:
    '<path d="M3 5h11v12H3Zm11 5h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  train:
    '<rect x="5" y="3" width="14" height="15" rx="4"/><path d="M5 10h14M12 3v7M8 14h.01M16 14h.01M8 18l-3 4m11-4 3 4M7 20h10"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  scan: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>',
  orbit:
    '<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="11" ry="5" transform="rotate(-35 12 12)"/><path d="M7 5c0-5 7-5 10 2s2 15-2 15"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
export function icon(name, className = "") {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.globe}</svg>`;
}
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
}
