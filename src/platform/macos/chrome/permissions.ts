import { type JxaRunner, runJxa } from "./jxa.js";

export interface AutomationPermission {
  permitted: boolean;
  status: "granted" | "denied" | "unknown";
  detail: string | null;
}

const PERMISSION_CHECK_SCRIPT = `(() => {
  const chrome = Application("Google Chrome");
  chrome.running();
  return "ok";
})()`;

export async function checkAutomationPermission(
  run: JxaRunner = runJxa,
): Promise<AutomationPermission> {
  try {
    await run(PERMISSION_CHECK_SCRIPT);
    return { permitted: true, status: "granted", detail: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const denied =
      message.includes("-1743") || message.includes("Not authorized to send Apple events");
    return {
      permitted: false,
      status: denied ? "denied" : "unknown",
      detail: message,
    };
  }
}
