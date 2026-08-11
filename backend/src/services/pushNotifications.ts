import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { config } from "../config";

type TaskNotification = { id: string; clientName: string; clientAddress: string };

let client: Messaging | null | undefined;

function messagingClient(): Messaging | null {
  if (client !== undefined) return client;
  if (!config.firebaseServiceAccountPath && !config.firebaseServiceAccountJson) {
    console.warn("[push] FCM disabled: Firebase service account is not configured");
    client = null;
    return client;
  }
  try {
    const raw = config.firebaseServiceAccountJson
      ?? readFileSync(resolve(process.cwd(), config.firebaseServiceAccountPath!), "utf8");
    const serviceAccount = JSON.parse(raw);
    if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
    client = getMessaging();
  } catch (error) {
    console.error("[push] FCM disabled: could not initialize Firebase Admin", error);
    client = null;
  }
  return client;
}

export async function sendTaskAssignmentPush(tokens: string[], task: TaskNotification): Promise<string[]> {
  const messaging = messagingClient();
  if (!messaging || tokens.length === 0) return [];
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: "New delivery task", body: `Task assigned for ${task.clientName}` },
    data: { type: "task_assigned", taskId: task.id },
    android: { priority: "high", notification: { channelId: "task-assignments", sound: "default", priority: "high" } },
  });
  return response.responses.flatMap((result, index) => {
    if (result.success) return [];
    const code = result.error?.code;
    return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token" ? [tokens[index]] : [];
  });
}
