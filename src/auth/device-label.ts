/** What the browser says about the machine it runs on, as far as naming it
 * needs.
 *
 * Three fields rather than the user agent alone, because on one device the
 * string is a lie everybody agreed to: an iPad's Safari names itself a
 * Macintosh, and has since it began asking for desktop pages. What tells the
 * two apart is the touch screen. */
export interface DeviceAgent {
  readonly userAgent: string;
  /** `navigator.platform`. */
  readonly platform?: string;
  /** `navigator.maxTouchPoints`. A Mac reports 0. */
  readonly maxTouchPoints?: number;
  /** `navigator.userAgentData?.platform`, where the browser has it: a plain
   * name the browser states rather than one read out of a sentence. */
  readonly statedPlatform?: string;
}

/** Whether the browser presents itself as a Mac, whichever way it is asked.
 *
 * The stated platform is preferred where there is one — it is the answer the
 * browser gives on purpose, and the only one with no history to parse. Safari
 * has none, so the other two carry it there. */
function namesMac(agent: DeviceAgent): boolean {
  const stated = agent.statedPlatform;
  if (stated !== undefined && stated !== "") return /^mac/i.test(stated);
  return (agent.platform ?? "").startsWith("Mac") || /\bMacintosh\b/.test(agent.userAgent);
}

/** A first guess at what the person will call the device they are registering.
 *
 * It is a suggestion in an input they can rewrite, and it is theirs alone —
 * the record keeps the administrator's label beside it, and what this fills in
 * is the half that answers "which of my devices is this line". So it says the
 * thing a person would say ("Mac Chrome", "iPhone") rather than anything a
 * user agent string is precise about. */
export function defaultDeviceLabel(agent: DeviceAgent): string {
  const userAgent = agent.userAgent;
  // A machine that names itself a Mac and takes more than one finger is an
  // iPad: no Mac reports touch points, and every iPad browser rides on the
  // one engine, so the claim and the screen disagree on that device alone.
  const mac = namesMac(agent);
  const device = /\biPhone\b/.test(userAgent)
    ? "iPhone"
    : /\biPad\b/.test(userAgent) || (mac && (agent.maxTouchPoints ?? 0) > 1)
      ? "iPad"
      : /\bAndroid\b/.test(userAgent)
        ? "Android"
        : mac || /\bMac OS X\b/.test(userAgent)
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
            : // Not anchored at a word boundary: the Chromium builds that
              // spell it "HeadlessChrome/" are the same browser to a person.
              /Chrome\//.test(userAgent)
              ? "Chrome"
              : /\bSafari\//.test(userAgent)
                ? "Safari"
                : "";
  const words = [device, browser].filter((one) => one !== "");
  return words.length === 0 ? "この端末" : words.join(" ");
}

/** What this browser says about itself, in the shape the guess above reads.
 *
 * `userAgentData` is not in every browser's `Navigator`, and the one browser
 * this whole question is about is the one without it. */
export function thisDevice(navigator: Navigator): DeviceAgent {
  const stated = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    ...(stated?.platform === undefined ? {} : { statedPlatform: stated.platform }),
  };
}
