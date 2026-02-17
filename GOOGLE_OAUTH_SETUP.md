# Google OAuth Setup Guide

This guide walks you through setting up Google OAuth for Gmail and Calendar API access.

## Prerequisites

- Google Workspace account (or Gmail)
- Access to Google Cloud Console

## Step 1: Create Google Cloud Project

1. Go to https://console.cloud.google.com
2. Click "Select a project" → "New Project"
3. Name it: "Lead Gen Oracle Finance"
4. Click "Create"

## Step 2: Enable APIs

1. Go to "APIs & Services" → "Library"
2. Search and enable these APIs:
   - Gmail API
   - Google Calendar API
   - People API (optional, for contacts)

## Step 3: Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Select "External" (or "Internal" if Workspace admin)
3. Click "Create"
4. Fill in:
   - App name: "Lead Gen System"
   - User support email: your email
   - Developer contact: your email
5. Click "Save and Continue"
6. On "Scopes" page, click "Add or Remove Scopes"
7. Add these scopes:
   ```
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/calendar
   https://www.googleapis.com/auth/calendar.events
   ```
8. Click "Save and Continue"
9. Add test users (your email)
10. Click "Save and Continue"

## Step 4: Create OAuth Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Select "Desktop app" as Application type
4. Name: "Lead Gen Desktop Client"
5. Click "Create"
6. **Download the JSON file** - this contains your client ID and secret
7. Rename it to `credentials.json` and place in project root

## Step 5: Get Refresh Token

Run the authentication script:

```bash
npm install
node scripts/google-auth.js
```

This will:
1. Open a browser window
2. Ask you to sign in to Google
3. Request permission for Gmail/Calendar access
4. Display a refresh token
5. Save it to your `.env` file

## Step 6: Update .env

Add these to your `.env` file:

```bash
GOOGLE_CLIENT_ID=your_client_id_from_credentials.json
GOOGLE_CLIENT_SECRET=your_client_secret_from_credentials.json
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_REFRESH_TOKEN=token_from_step_5
```

## Testing

Run this to verify everything works:

```bash
node scripts/test-google-apis.js
```

It will send a test email to yourself and create a test calendar event.

## Troubleshooting

### "Access blocked" error
- Your app is in "Testing" mode
- Add your email as a test user in OAuth consent screen

### "Token expired" error
- Refresh tokens don't expire
- But if you revoke access, you need to re-authenticate

### Rate limits
- Gmail: 500 emails/day (well above your 10/day limit)
- Calendar: 10,000 requests/day

## Security Notes

- Never commit `credentials.json` or `.env`
- Store refresh token securely
- If token is compromised, revoke in Google Account settings

## Next Steps

Once OAuth is set up:
1. Add Hunter.io API key
2. Add Apollo.io API key
3. Configure email templates
4. Run `npm run scrape` to test
