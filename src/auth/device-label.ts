/** A first guess at what the person will call the device they are registering.
 *
 * It is a suggestion in an input they can rewrite, and it is theirs alone —
 * the record keeps the administrator's label beside it, and what this fills in
 * is the half that answers "which of my devices is this line". So it says the
 * thing a person would say ("Mac Chrome", "iPhone") rather than anything a
 * user agent string is precise about. */
export function defaultDeviceLabel(userAgent: string): string {
  const device = /\biPhone\b/.test(userAgent)
    ? "iPhone"
    : /\biPad\b/.test(userAgent)
      ? "iPad"
      : /\bAndroid\b/.test(userAgent)
        ? "Android"
        : /\bMac OS X\b|\bMacintosh\b/.test(userAgent)
          ? "Mac"
          : /\bWindows\b/.test(userAgent)
            ? "Windows"
            : /\bLinux\b|\bX11\b/.test(userAgent)
              ? "Linux"
              : "";
  // A phone or a tablet is the device a person names; which browser it was
  // matters on a desktop, where several are in use at once.
  const browser =
    device === "iPhone" || device === "iPad"
      ? ""
      : /\bEdg\//.test(userAgent)
        ? "Edge"
        : /\bOPR\//.test(userAgent)
          ? "Opera"
          : /\bFirefox\//.test(userAgent)
            ? "Firefox"
            : /\bChrome\//.test(userAgent)
              ? "Chrome"
              : /\bSafari\//.test(userAgent)
                ? "Safari"
                : "";
  const words = [device, browser].filter((one) => one !== "");
  return words.length === 0 ? "この端末" : words.join(" ");
}
