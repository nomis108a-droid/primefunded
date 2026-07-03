import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const FROM = 'PrimeFunded <primefundedfund@gmail.com>';

function baseTemplate(title: string, body: string) {
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#0a0a0a;padding:20px;text-align:center"><h1 style="color:#00d4ff;margin:0">PrimeFunded</h1></div><div style="background:#111;padding:30px;color:#fff"><h2 style="color:#fff">' + title + '</h2>' + body + '<a href="https://primefunded.fund/dashboard" style="background:#00d4ff;color:#000;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;margin-top:20px">View Dashboard</a></div><div style="background:#0a0a0a;padding:15px;text-align:center"><p style="color:#555;font-size:12px">PrimeFunded Institutional Trading</p></div></div>';
}

async function sendMail(to: string, subject: string, html: string) {
  await adminDb.collection('mail').add({ from: FROM, to, message: { subject, html }, createdAt: FieldValue.serverTimestamp() });
}

export async function sendBreachEmail(email: string, breachDetails: string) {
  await sendMail(email, 'PrimeFunded: Account Breach Alert', baseTemplate('Account Breach Detected', '<p style="color:#ccc">' + breachDetails + '</p>'));
}
export async function sendChallengePassEmail(email: string, name: string, challenge: string, size: string) {
  await sendMail(email, 'PrimeFunded: Challenge Passed', baseTemplate('Challenge Passed!', '<p style="color:#ccc">Congratulations ' + name + '! You passed your ' + challenge + ' - ' + size + ' challenge.</p>'));
}
export async function sendChallengeFailEmail(email: string, name: string, challenge: string, size: string, reason: string) {
  await sendMail(email, 'PrimeFunded: Challenge Terminated', baseTemplate('Challenge Terminated', '<p style="color:#ccc">Hi ' + name + ', your ' + challenge + ' - ' + size + ' was terminated. Reason: ' + reason + '</p>'));
}
export async function sendBroadcastEmail(email: string, title: string, body: string, name: string) {
  await sendMail(email, 'PrimeFunded: ' + title, baseTemplate(title, '<p style="color:#ccc">Hi ' + name + ', ' + body + '</p>'));
}
export async function sendKycApprovalEmail(email: string) {
  await sendMail(email, 'PrimeFunded: KYC Approved', baseTemplate('KYC Approved', '<p style="color:#ccc">Your identity verification has been approved. You now have full access.</p>'));
}
export async function sendKycRejectionEmail(email: string, reason: string) {
  await sendMail(email, 'PrimeFunded: KYC Failed', baseTemplate('KYC Verification Failed', '<p style="color:#ccc">Reason: ' + reason + '. Please re-submit correct documents.</p>'));
}
export async function sendFreeAccountGrantEmail(email: string, plan: string, size: string) {
  await sendMail(email, 'PrimeFunded: Free Account Granted', baseTemplate('Free Account Granted!', '<p style="color:#ccc">You have been granted a free ' + plan + ' - ' + size + ' account!</p>'));
}
export async function sendReferralCommissionEmail(email: string, amount: number, referredEmail: string) {
  await sendMail(email, 'PrimeFunded: Referral Commission Earned', baseTemplate('Referral Commission Earned!', '<p style="color:#ccc">You earned $' + amount.toFixed(2) + ' from referring ' + referredEmail + '.</p>'));
}
export async function sendPayoutRequestedEmail(email: string, amount: string) {
  await sendMail(email, 'PrimeFunded: Payout Request Received', baseTemplate('Payout Request Received', '<p style="color:#ccc">Your payout request of ' + amount + ' is being reviewed.</p>'));
}
export async function sendPayoutProcessedEmail(email: string, amount: string) {
  await sendMail(email, 'PrimeFunded: Payout Processed', baseTemplate('Payout Processed!', '<p style="color:#ccc">Your payout of ' + amount + ' has been processed successfully.</p>'));
}
export async function sendCredentialEmail(email: string, details: any) {
  await sendMail(email, 'PrimeFunded: Account Credentials', baseTemplate('Your Account Credentials', '<p style="color:#ccc">Account details: ' + JSON.stringify(details) + '</p>'));
}
