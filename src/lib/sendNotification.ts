import { db } from '@/lib/firebase';
import { collection, addDoc, getDoc, doc, serverTimestamp } from 'firebase/firestore';

/**
 * Client-side helper to send notifications and trigger emails.
 */
export async function sendNotification(
  userId: string,
  title: string,
  message: string,
  type: string
) {
  try {
    // 1. Add notification to user subcollection
    await addDoc(collection(db, 'users', userId, 'notifications'), {
      title,
      message,
      type,
      isRead: false,
      createdAt: serverTimestamp()
    });

    // 2. Fetch user email to trigger mail collection
    const userDoc = await getDoc(doc(db, 'users', userId));
    const email = userDoc.data()?.email;

    if (email) {
      await addDoc(collection(db, 'mail'), {
        to: email,
        message: {
          subject: `PrimeFunded: ${title}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#0a0a0a;padding:20px;text-align:center;">
                <h1 style="color:#00d4ff;margin:0;">PrimeFunded</h1>
              </div>
              <div style="background:#111;padding:30px;color:#fff;">
                <h2 style="color:#fff;">${title}</h2>
                <p style="color:#ccc;line-height:1.6;">${message}</p>
                <a href="https://primefunded.fund/dashboard"
                   style="background:#00d4ff;color:#000;padding:12px 24px;
                          text-decoration:none;border-radius:6px;
                          font-weight:bold;display:inline-block;margin-top:20px;">
                  View Dashboard
                </a>
              </div>
              <div style="background:#0a0a0a;padding:15px;text-align:center;">
                <p style="color:#555;font-size:12px;">PrimeFunded Institutional Trading</p>
              </div>
            </div>
          `
        }
      });
    }
  } catch (err) {
    console.error('sendNotification error:', err);
  }
}
