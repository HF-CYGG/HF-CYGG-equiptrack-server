import * as admin from 'firebase-admin';
import { AppDataSource } from "../data-source";
import { DeviceToken } from "../entities/DeviceToken";
import { User } from "../entities/User";
import { In } from "typeorm";

// Initialize Firebase Admin
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

export async function registerDeviceToken(userId: string, token: string, platform: 'android' | 'ios' | 'web' | string) {
  const repo = AppDataSource.getRepository(DeviceToken);
  let tokenEntry = await repo.findOneBy({ token });
  
  if (tokenEntry) {
    // Update existing
    tokenEntry.userId = userId;
    tokenEntry.updatedAt = new Date().toISOString();
    await repo.save(tokenEntry);
  } else {
    // Add new
    tokenEntry = repo.create({
      userId,
      token,
      platform,
      updatedAt: new Date().toISOString()
    });
    await repo.save(tokenEntry);
  }
  
  console.log(`[Notification] Token registered for user ${userId}`);
}

export async function sendPushNotification(userIds: string[], title: string, body: string, data?: Record<string, string>) {
  if (admin.apps.length === 0) {
    console.log(`[Mock Push] To: ${userIds.length} users, Title: ${title}, Body: ${body}`);
    return;
  }

  const repo = AppDataSource.getRepository(DeviceToken);
  const tokens = await repo.find({ where: { userId: In(userIds) } });
  const targetTokens = tokens.map(t => t.token);

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
                     repo.delete({ token: uniqueTokens[idx] }).catch(console.error);
                }
            }
        });
    }
  } catch (error) {
    console.error('[Notification] Send error:', error);
  }
}

// Helper to notify admins
export async function notifyAdmins(title: string, body: string, data?: Record<string, string>, targetDepartmentId?: string) {
    const userRepo = AppDataSource.getRepository(User);
    
    // Fetch all potential admins
    const admins = await userRepo.find({
        where: [
            { role: '超级管理员' },
            { role: '管理员' },
            { role: '高级用户' }
        ]
    });

    const targetUserIds = admins.filter(u => {
        if (u.role === '超级管理员') return true;
        if (u.role === '管理员' || u.role === '高级用户') {
            // If a specific department is targeted, only notify admins of that department
            if (targetDepartmentId) {
                return u.departmentId === targetDepartmentId;
            }
            return true; // If no department specified, notify all admins (fallback)
        }
        return false;
    }).map(u => u.id);

    if (targetUserIds.length > 0) {
        await sendPushNotification(targetUserIds, title, body, data);
    }
}
