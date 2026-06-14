# Firebase Authentication Setup Guide

This app now uses **Firebase Authentication** for login/signup while keeping **Supabase** for the database.

## 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Create a project"**
3. Enter a project name (e.g., "Splitsy")
4. Disable Google Analytics (optional)
5. Click **Create project**

## 2. Set Up Authentication

1. In Firebase Console, go to **Authentication** (left sidebar)
2. Click **Get started**
3. Enable providers:
   - **Email/Password**
     - Click **Email/Password**
     - Toggle **Enable**
     - Uncheck "Email link (passwordless sign-in)" (optional)
     - Click **Save**
   - **Google**
     - Click **Google**
     - Toggle **Enable**
     - Select your support email
     - Click **Save**

## 3. Get Your Firebase Config

1. In Firebase Console, click the **gear icon** (Settings) → **Project settings**
2. Scroll down to **"Your apps"** section
3. If no app exists, click **"Add app"** → **Web** (</> icon)
4. Register your app with name "Splitsy"
5. Copy your Firebase config credentials

## 4. Add Environment Variables

Create or update `.env.local` in your project root:

```env
# Firebase Config
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_APP_ID

# Supabase (for database)
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## 5. Configure Google OAuth Redirect URI (if using Google Sign-in)

1. In Firebase Console, go to **Authentication** → **Settings** → **Authorized domains**
2. Add your domains:
   - `localhost` (for local development)
   - Your production domain (e.g., `yourdomain.com`)

Firebase automatically handles OAuth redirects, so no additional redirect URI setup is needed.

## 6. Test the Setup

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to `http://localhost:3000/login`

3. Test:
   - **Email/Password login**: Create an account and sign in
   - **Google Sign-in**: Click "Sign in with Google" button

4. After successful login, you should be redirected to `/groups`

## 7. Deploy to Production

When deploying to production:

1. Update environment variables in your hosting platform (Vercel, Netlify, etc.)
2. Add your production domain to Firebase **Authorized domains**
3. Ensure HTTPS is enabled on your domain (required by Firebase)

## How It Works

- **Firebase** handles user authentication (login, signup, password reset)
- **Supabase** stores user data and expenses
- When a user logs in with Firebase, their user ID is available in your app
- User profile data from Firebase can be synced to Supabase if needed

## Troubleshooting

### "The operation is not supported in this environment" error
- Make sure you're using Firebase in a browser environment
- Check that all environment variables are set correctly

### Google Sign-in not working
- Verify your domain is in Firebase **Authorized domains**
- Check that your OAuth consent screen is configured in Google Cloud Console

### Users not appearing in Supabase
- Firebase and Supabase are separate systems
- You need to manually create user records in Supabase when Firebase users sign up
- Or set up a Cloud Function to sync them automatically

## Resources

- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firebase JavaScript SDK](https://firebase.google.com/docs/web/setup)
- [Next.js + Firebase Guide](https://firebase.google.com/docs/web/frameworks-libraries)
