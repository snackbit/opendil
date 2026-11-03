/** Pick the more readable foreground for the color input's six-digit sRGB value. */
export function primaryForeground(value: string) {
  const rgb = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (!rgb) return "#ffffff";
  const linear = (hex: string) => {
    const c = Number.parseInt(hex, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    linear(value.slice(1, 3)) * 0.2126 +
    linear(value.slice(3, 5)) * 0.7152 +
    linear(value.slice(5, 7)) * 0.0722;
  return (luminance + 0.05) / 0.057 > 1.05 / (luminance + 0.05)
    ? "#12141c"
    : "#ffffff";
}
