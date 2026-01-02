import * as admin from 'firebase-admin';
import { readAll, writeAll } from '../utils/store';
import { DeviceToken, User } from '../models/types';

// Initialize Firebase Admin
// We try to use environment variables for credentials or fallback to default application credentials
try {
  if (process.env.FIREBASE_CREDENTIALS) {
     const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
     if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("[Notification] Firebase Admin initialized with credentials");
     }
  } else {
     // Try default initialization (works if GOOGLE_APPLICATION_CREDENTIALS is set)
     if (admin.apps.length === 0) {
        admin.initializeApp();
        console.log("[Notification] Firebase Admin initialized with default credentials");
     }
  }
} catch (error) {
  console.warn("[Notification] Failed to initialize Firebase Admin. Push notifications will be skipped.", error);
}

export async function registerDeviceToken(userId: string, token: string, platform: 'android' | 'ios' | 'web') {
  const tokens = await readAll<DeviceToken>('device_tokens');
  
  // Check if token exists
  const existingIndex = tokens.findIndex(t => t.token === token);
  
  if (existingIndex >= 0) {
    // Update existing
    tokens[existingIndex].userId = userId; // Update owner if changed
    tokens[existingIndex].updatedAt = new Date().toISOString();
  } else {
    // Add new
    tokens.push({
      userId,
      token,
      platform,
      updatedAt: new Date().toISOString()
    });
  }
  
  await writeAll('device_tokens', tokens);
  console.log(`[Notification] Token registered for user ${userId}`);
}

export async function sendPushNotification(userIds: string[], title: string, body: string, data?: Record<string, string>) {
  if (admin.apps.length === 0) {
    console.log(`[Mock Push] To: ${userIds.length} users, Title: ${title}, Body: ${body}`);
    return;
  }

  const tokens = await readAll<DeviceToken>('device_tokens');
  const targetTokens = tokens
    .filter(t => userIds.includes(t.userId))
    .map(t => t.token);

  if (targetTokens.length === 0) {
      console.log(`[Notification] No devices found for users: ${userIds.join(', ')}`);
      return;
  }

  // Deduplicate tokens
  const uniqueTokens = [...new Set(targetTokens)];

  const message: admin.messaging.MulticastMessage = {
    tokens: uniqueTokens,
    notification: {
      title,
      body,
    },
    data,
    android: {
        priority: 'high',
        notification: {
            sound: 'default',
            channelId: 'approval_channel',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK', // or android specific intent
        }
    }
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log('[Notification] Sent:', response.successCount, 'Failed:', response.failureCount);
    
    if (response.failureCount > 0) {
        // Cleanup invalid tokens logic could go here
        response.responses.forEach((resp: admin.messaging.SendResponse, idx: number) => {
            if (!resp.success) {
                const err = resp.error;
                if (err && (err.code === 'messaging/invalid-registration-token' || err.code === 'messaging/registration-token-not-registered')) {
                     // We could remove this token from store
                     console.log(`[Notification] Invalid token detected: ${uniqueTokens[idx]}`);
                }
            }
        });
    }
  } catch (error) {
    console.error('[Notification] Send error:', error);
  }
}

// Helper to notify admins
export async function notifyAdmins(title: string, body: string, data?: Record<string, string>) {
    const users = await readAll<User>('users');
    const admins = users.filter(u => u.role === '超级管理员' || u.role === '管理员').map(u => u.id);
    if (admins.length > 0) {
        await sendPushNotification(admins, title, body, data);
    }
}
