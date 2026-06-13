# Google OAuth Setup Guide

To enable Google Sign-in, follow these steps:

## 1. Set up Google OAuth Credentials

### In Google Cloud Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
4. Choose **Web application**
5. Add Authorized JavaScript origins:
   - `http://localhost:3000` (for local development)
   - Your production domain (e.g., `https://yourdomain.com`)
6. Add Authorized redirect URIs:
   - `http://localhost:3000/auth/callback` (for local development)
   - `https://yourdomain.com/auth/callback` (for production)
   - Also add your Supabase redirect: `https://<PROJECT_ID>.supabase.co/auth/v1/callback`
7. Copy your **Client ID** and **Client Secret**

## 2. Configure in Supabase

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Providers**
3. Find **Google** and enable it
4. Paste your Google **Client ID** and **Client Secret**
5. Save

## 3. Update Environment Variables (if needed)

Make sure your `.env.local` file has:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 4. Test Google Sign-in

1. Navigate to `/login` or `/signup`
2. Click "Sign in with Google" or "Sign up with Google"
3. You should be redirected to Google's login page
4. After authenticating, you'll be redirected back to your app

## Troubleshooting

- **"Invalid request" error**: Check that redirect URIs match exactly in both Google Cloud Console and Supabase
- **User not created**: Ensure email confirmation is disabled or the user confirms their email
- **CORS errors**: Make sure localhost/domain is added to JavaScript origins in Google Cloud Console
