const { google } = require('googleapis');
require('dotenv').config();

async function testGoogleAPIs() {
  console.log('Testing Google API Integration...\n');
  
  // Check if credentials exist
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    console.error('❌ Missing Google OAuth credentials in .env');
    console.log('\nRun: node scripts/google-auth.js');
    process.exit(1);
  }
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });
  
  // Test Gmail
  console.log('1. Testing Gmail API...');
  try {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log(`   ✓ Gmail connected: ${profile.data.emailAddress}`);
  } catch (error) {
    console.error('   ✗ Gmail error:', error.message);
  }
  
  // Test Calendar
  console.log('\n2. Testing Calendar API...');
  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendars = await calendar.calendarList.list();
    console.log(`   ✓ Calendar connected: ${calendars.data.items.length} calendars found`);
    console.log(`   Primary: ${calendars.data.items.find(c => c.primary)?.summary}`);
  } catch (error) {
    console.error('   ✗ Calendar error:', error.message);
  }
  
  // Test sending email (to yourself)
  console.log('\n3. Testing email sending...');
  console.log('   (This will send a test email to yourself)');
  
  try {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const message = [
      'From: "Test" <me>',
      'To: me',
      'Subject: Lead Gen System - Test Email',
      '',
      'This is a test email from your Lead Generation System.\n\n',
      'If you received this, email sending is working correctly!\n\n',
      'Time: ' + new Date().toISOString()
    ].join('\n');
    
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage }
    });
    
    console.log('   ✓ Test email sent successfully');
    console.log('   Check your inbox!');
    
  } catch (error) {
    console.error('   ✗ Email sending error:', error.message);
  }
  
  console.log('\n═══════════════════════════════════════════');
  console.log('  Test Complete!');
  console.log('═══════════════════════════════════════════\n');
  
  console.log('Next steps:');
  console.log('1. Check your email for the test message');
  console.log('2. Add Hunter.io and Apollo.io API keys to .env');
  console.log('3. Run: npm run scrape');
}

testGoogleAPIs().catch(console.error);
