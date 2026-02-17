const { google } = require('googleapis');
const logger = require('../utils/logger');
const db = require('../database/db');

class EmailSender {
  constructor() {
    this.maxDailyEmails = parseInt(process.env.MAX_DAILY_EMAILS) || 10;
    this.senderEmail = process.env.SENDER_EMAIL;
    this.senderName = process.env.SENDER_NAME;
    this.companyName = process.env.COMPANY_NAME;
    this.companyAddress = process.env.COMPANY_ADDRESS;
    
    this.gmail = null;
    this.oauth2Client = null;
  }

  async initialize() {
    // Setup Google OAuth
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    this.oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
    
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    
    logger.info('Email sender initialized');
  }

  async sendDailyBatch() {
    logger.info('Checking for emails to send...');
    
    // Check if we're within business hours
    if (!this.isBusinessHours()) {
      logger.info('Outside business hours, skipping');
      return;
    }
    
    // Check daily limit
    const sentToday = await this.getSentCountToday();
    const remaining = this.maxDailyEmails - sentToday;
    
    if (remaining <= 0) {
      logger.info(`Daily limit reached (${sentToday}/${this.maxDailyEmails})`);
      return;
    }
    
    logger.info(`Can send ${remaining} emails today (${sentToday} already sent)`);
    
    // Get contacts ready for outreach
    const contacts = await db.query(
      `SELECT c.*, comp.name as company_name, comp.email_domain
       FROM contacts c
       JOIN companies comp ON c.company_id = comp.id
       WHERE c.status = 'ready'
       AND c.confidence >= ?
       ORDER BY c.confidence DESC
       LIMIT ?`,
      [process.env.MIN_LEAD_SCORE || 70, remaining]
    );
    
    logger.info(`Found ${contacts.length} contacts ready for outreach`);
    
    for (const contact of contacts) {
      await this.sendEmail(contact);
      await this.sleep(5000); // 5 second delay between emails
    }
  }

  async sendEmail(contact) {
    try {
      logger.info(`Sending email to: ${contact.first_name} ${contact.last_name} (${contact.email})`);
      
      // Generate personalized email
      const emailContent = this.generateEmail(contact);
      
      // Create email message
      const message = this.createEmailMessage(
        contact.email,
        emailContent.subject,
        emailContent.body
      );
      
      // Send via Gmail API
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: message
        }
      });
      
      // Log the email
      await this.logEmail(contact, response.data.id, emailContent);
      
      // Update contact status
      await db.run(
        `UPDATE contacts 
         SET status = 'contacted', 
             last_contact_date = datetime('now'),
             gmail_message_id = ?
         WHERE id = ?`,
        [response.data.id, contact.id]
      );
      
      logger.info(`✓ Email sent successfully to ${contact.email}`);
      
    } catch (error) {
      logger.error(`Failed to send email to ${contact.email}:`, error.message);
      
      // Mark as failed
      await db.run(
        `UPDATE contacts SET status = 'failed', updated_at = datetime('now') WHERE id = ?`,
        [contact.id]
      );
    }
  }

  generateEmail(contact) {
    const firstName = contact.first_name;
    const companyName = contact.company_name;
    const title = contact.title;
    
    // Subject line
    const subject = `Quick question about ${companyName}'s Oracle PBCS implementation`;
    
    // Body
    const body = `Hi ${firstName},

I noticed ${companyName} is looking for ${title} expertise with Oracle PBCS/Hyperion planning systems.

I'm reaching out from Intersection Data Finance - we specialize in helping finance teams automate their Oracle PBCS workflows and streamline FP&A reporting.

We've developed a subscription-based app that integrates with Oracle PBCS to automate:
• Monthly close processes
• Budget variance reporting  
• Cash flow forecasting
• Management reporting packages

Plus our consulting team provides implementation and ongoing FP&A support.

Would you be open to a brief 15-minute call to see if there's a fit? I can share how we've helped similar companies reduce their reporting time by 60%+.

Best regards,
${this.senderName}
${this.companyName}
${this.companyAddress}

---
If you'd prefer not to hear from me, just reply "unsubscribe" and I'll remove you from my list.
View our privacy policy: ${process.env.PRIVACY_POLICY_LINK}`;

    return { subject, body };
  }

  createEmailMessage(to, subject, body) {
    const messageParts = [
      `From: "${this.senderName}" <${this.senderEmail}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      body
    ];
    
    const message = messageParts.join('\n');
    
    // Base64 encode
    return Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  async logEmail(contact, gmailMessageId, emailContent) {
    await db.run(
      `INSERT INTO emails_sent (contact_id, gmail_message_id, subject, body, sent_at, status)
       VALUES (?, ?, ?, ?, datetime('now'), 'sent')`,
      [contact.id, gmailMessageId, emailContent.subject, emailContent.body]
    );
  }

  async getSentCountToday() {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM emails_sent 
       WHERE date(sent_at) = date('now')`
    );
    return result[0].count;
  }

  isBusinessHours() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // Check if weekday (1-5)
    if (day === 0 || day === 6) return false;
    
    // Check business hours (9 AM - 5 PM)
    const startHour = 9;
    const endHour = 17;
    
    return hour >= startHour && hour < endHour;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = EmailSender;
