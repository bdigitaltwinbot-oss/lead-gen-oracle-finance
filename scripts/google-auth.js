const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const readline = require('readline');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

// Load credentials
credentials = null;
try {
  credentials = require('../credentials.json');
} catch (e) {
  console.error('❌ credentials.json not found!');
  console.log('\nPlease follow these steps:');
  console.log('1. Go to https://console.cloud.google.com');
  console.log('2. Create a project and enable Gmail + Calendar APIs');
  console.log('3. Go to Credentials → Create OAuth client ID (Desktop app)');
  console.log('4. Download the JSON and rename to credentials.json');
  console.log('5. Place it in the project root directory');
  console.log('\nSee GOOGLE_OAUTH_SETUP.md for detailed instructions.');
  process.exit(1);
}

const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3000/oauth2callback');

console.log('═══════════════════════════════════════════');
console.log('  Google OAuth Authentication');
console.log('═══════════════════════════════════════════\n');

// Generate auth URL
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent' // Force to get refresh token
});

console.log('1. Open this URL in your browser:');
console.log('\n' + authUrl + '\n');
console.log('2. Sign in with your Google account');
console.log('3. Grant permission for Gmail and Calendar access');
console.log('4. You will be redirected to localhost (ignore the error page)');
console.log('5. Copy the "code" from the URL\n');

// Create local server to handle callback
const server = http.createServer(async (req, res) => {
  const queryObject = url.parse(req.url, true).query;
  
  if (queryObject.code) {
    const code = queryObject.code;
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write('<h1>Authentication successful!</h1>');
    res.write('<p>You can close this window.</p>');
    res.end();
    
    server.close();
    
    try {
      console.log('Exchanging code for tokens...');
      const { tokens } = await oAuth2Client.getToken(code);
      
      console.log('\n✅ SUCCESS!\n');
      console.log('═══════════════════════════════════════════');
      console.log('  ADD THESE TO YOUR .env FILE:');
      console.log('═══════════════════════════════════════════\n');
      console.log(`GOOGLE_CLIENT_ID=${client_id}`);
      console.log(`GOOGLE_CLIENT_SECRET=${client_secret}`);
      console.log(`GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback`);
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('\n═══════════════════════════════════════════\n');
      
      // Save to file for convenience
      const envUpdate = `\n# Google OAuth (Added ${new Date().toISOString()})\nGOOGLE_CLIENT_ID=${client_id}\nGOOGLE_CLIENT_SECRET=${client_secret}\nGOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
      
      fs.appendFileSync('.env', envUpdate);
      console.log('✓ These values have been appended to your .env file');
      console.log('\nYou can now run: npm run send');
      
    } catch (error) {
      console.error('\n❌ Error getting tokens:', error.message);
    }
    
    process.exit(0);
  }
});

server.listen(3000, () => {
  console.log('Waiting for authentication...\n');
});

// Timeout after 5 minutes
setTimeout(() => {
  console.log('\n❌ Authentication timeout (5 minutes)');
  server.close();
  process.exit(1);
}, 300000);
