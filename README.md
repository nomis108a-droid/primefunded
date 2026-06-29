
# PrimeFunded | Institutional Trading Platform

This is a professional Next.js 15 trading platform integrated with Firebase.

## GitHub Setup

To push this project to your repository, run the following commands in your local terminal:

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/sitarama108a-alt/primefunded.git
git push -u origin main
```

## Deployment Instructions (Vercel)

1. **Import to Vercel**: Connect your repository to a new project in the [Vercel Dashboard](https://vercel.com/dashboard).
2. **Set Environment Variables**: Ensure the following variables are set in the Vercel Project Settings:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `ADMIN_PASSWORD`: Your secret admin terminal key.
   - `MAINTENANCE_MODE`: Set to `true` to disable the terminal globally.
3. **Custom Domain**: Add your domain under `Settings > Domains`.

## Features
- **MT5 Integration**: Automated balance and equity syncing via `/api/mt5-update`.
- **Prop Firm Logic**: 1-Step, 2-Step, and Instant Funding models with hard-breach monitoring.
- **Admin Terminal**: Full user management, KYC review, and manual order verification.
- **Referral System**: Multi-tier referral tracking with custom codes.

## Security
- Firestore Security Rules enforce data ownership.
- Input sanitization and Zod validation on all forms.
- HSTS and CSP headers configured for production.
