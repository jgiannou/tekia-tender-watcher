export type SlackClient = {
  sendText: (text: string) => Promise<boolean>;
};

export const createSlackClient = (
  webhookUrl: string | undefined,
): SlackClient => {
  return {
    sendText: async (text: string): Promise<boolean> => {
      if (!webhookUrl) {
        console.warn("slack skipped: SLACK_WEBHOOK_URL is not configured");
        return false;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          console.error(
            `slack send failed: HTTP ${response.status} ${body.slice(0, 200)}`,
          );
          return false;
        }

        return true;
      } catch (error) {
        console.error("slack send failed:", error instanceof Error ? error.message : error);
        return false;
      } finally {
        clearTimeout(timer);
      }
    },
  };
};
