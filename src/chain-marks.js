// Compact authored versions of the public chain marks, shared by DOM and 3D signs.
export function chainMark(id) {
  const paths = {
    1: '<path d="m12 1 7 11-7 4-7-4Zm0 17 7-4-7 9-7-9Z"/>',
    8453: '<circle cx="12" cy="12" r="10"/><path d="M1 12h13" stroke="#fff" stroke-width="2"/>',
    792703809:
      '<path d="m5 4 15 0-4 4H1Zm0 8h15l4 4H9Zm0 8h15l-4 4H1Z" transform="translate(0 -2)"/>',
    42161:
      '<path d="m12 1 10 6v10l-10 6-10-6V7Zm0 3L5 8v8l7 4 7-4V8Z" fill-rule="evenodd"/><path d="m10 7-5 10h4l5-10Zm5 3-4 7h4l3-5Z"/>',
    10: '<text x="12" y="17" text-anchor="middle" fill="currentColor" font-family="sans-serif" font-size="12" font-weight="900" font-style="italic">OP</text>',
    56: '<path d="m12 2 4 4-4 4-4-4Zm-6 6 4 4-4 4-4-4Zm12 0 4 4-4 4-4-4Zm-6 6 4 4-4 4-4-4Zm0-5 3 3-3 3-3-3Z"/>',
    43114: '<path d="M11 3 2 20h7l6-10Zm6 10-4 7h9Z"/>',
    8253038:
      '<text x="12" y="19" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="700">₿</text>',
    130: '<path d="M10 2h4v7h8v4h-8v9h-4v-9H2V9h8Z"/>',
    999: '<path d="M3 14C3 4 8 4 9 10s5 8 7 0 6-2 5 4-6 8-9 2-6 4-9-2Z"/>',
    59144: '<path d="M4 3h5v14h11v4H4Z"/><circle cx="18" cy="6" r="3"/>',
    137: '<path d="m8 5 5 3v5l-5 3-5-3V8Zm8 3 5 3v5l-5 3-5-3v-5Z" fill="none" stroke="currentColor" stroke-width="2.2"/>',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">${paths[id] || '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 12h16M12 4v16"/>'}</svg>`;
}

export function drawChainMark(ctx, id, x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = radius * 0.15;
  if (Number(id) === 1) {
    ctx.beginPath();
    ctx.moveTo(x, y - radius * 0.73);
    ctx.lineTo(x + radius * 0.48, y);
    ctx.lineTo(x, y + radius * 0.3);
    ctx.lineTo(x - radius * 0.48, y);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.45, y + radius * 0.17);
    ctx.lineTo(x, y + radius * 0.72);
    ctx.lineTo(x + radius * 0.45, y + radius * 0.17);
    ctx.lineTo(x, y + radius * 0.42);
    ctx.closePath();
    ctx.fill();
  } else if (Number(id) === 8453) {
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.7, y);
    ctx.lineTo(x + radius * 0.15, y);
    ctx.stroke();
  } else if (Number(id) === 792703809) {
    for (let i = -1; i <= 1; i++) {
      const sy = y + i * radius * 0.43;
      ctx.beginPath();
      ctx.moveTo(x - radius * 0.55, sy);
      ctx.lineTo(x + radius * 0.55, sy);
      ctx.lineTo(x + radius * 0.35, sy + radius * 0.2);
      ctx.lineTo(x - radius * 0.75, sy + radius * 0.2);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.font = `bold ${radius * 0.83}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      {
        42161: "A",
        10: "OP",
        137: "P",
        56: "BNB",
        43114: "A",
        8253038: "₿",
        130: "U",
        999: "H",
        59144: "L",
      }[id] || "↗",
      x,
      y + 1,
    );
  }
}
