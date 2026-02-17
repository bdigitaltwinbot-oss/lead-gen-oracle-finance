const { google } = require('googleapis');
const logger = require('../utils/logger');
const db = require('../database/db');

class InboundMonitor {
  constructor() {
    this.gmail = null;
    this.oauth2Client = null;
    this.processedMessageIds = new Set();
  }

  async initialize() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    this.oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
    
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    
    logger.info('Inbound email monitor initialized');
  }

  async checkForReplies() {
    logger.info('Checking for email replies...');
    
    try {
      // Get emails sent by us (to find threads)
      const sentEmails = await db.query(
        `SELECT gmail_message_id, contact_id FROM emails_sent 
         WHERE status = 'sent' AND created_at > datetime('now', '-7 days')`
      );
      
      for (const sent of sentEmails) {
        await this.checkThreadForReplies(sent.gmail_message_id, sent.contact_id);
      }
      
    } catch (error) {
      logger.error('Error checking replies:', error.message);
    }
  }

  async checkThreadForReplies(messageId, contactId) {
    try {
      // Get the thread
      const message = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId
      });
      
      const threadId = message.data.threadId;
      
      // Get all messages in thread
      const thread = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId
      });
      
      const messages = thread.data.messages || [];
      
      // Skip the first message (our original email)
      for (let i = 1; i < messages.length; i++) {
        const msg = messages[i];
        
        // Skip if already processed
        if (this.processedMessageIds.has(msg.id)) continue;
        
        // Get full message
        const fullMsg = await this.gmail.users.messages.get({
          userId: 'me',
          id: msg.id
        });
        
        // Check if it's from recipient (not us)
        const headers = fullMsg.data.payload.headers;
        const from = headers.find(h => h.name === 'From')?.value || '';
        
        if (!from.includes(process.env.SENDER_EMAIL)) {
          // This is a reply!
          await this.processReply(fullMsg.data, contactId);
          this.processedMessageIds.add(msg.id);
        }
      }
      
    } catch (error) {
      logger.error(`Error checking thread ${messageId}:`, error.message);
    }
  }

  async processReply(message, contactId) {
    try {
      const headers = message.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      
      // Extract body
      let body = '';
      if (message.payload.parts) {
        const textPart = message.payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart && textPart.body.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
        }
      } else if (message.payload.body.data) {
        body = Buffer.from(message.payload.body.data, 'base64').toString('utf8');
      }
      
      // Classify intent
      const intent = this.classifyIntent(body);
      
      // Save to database
      await db.run(
        `INSERT INTO email_replies (contact_id, gmail_message_id, subject, body, received_at, intent)
         VALUES (?, ?, ?, ?, datetime('now'), ?)`,
        [contactId, message.id, subject, body, intent]
      );
      
      // Update contact status
      await db.run(
        `UPDATE contacts SET status = 'replied', updated_at = datetime('now') WHERE id = ?`,
        [contactId]
      );
      
      logger.info(`✓ Reply received from contact ${contactId} - Intent: ${intent}`);
      
      // Send notification
      await this.sendAlert(subject, from, body, intent);
      
      // If interested, suggest booking meeting
      if (intent === 'interested' || intent === 'question') {
        await this.suggestMeeting(contactId);
      }
      
    } catch (error) {
      logger.error('Error processing reply:', error.message);
    }
  }

  classifyIntent(body) {
    const lowerBody = body.toLowerCase();
    
    // Check for unsubscribe/opt-out
    if (lowerBody.includes('unsubscribe') || 
        lowerBody.includes('remove') || 
        lowerBody.includes('stop') ||
        lowerBody.includes('don\'t email')) {
      return 'unsubscribe';
    }
    
    // Check for negative responses
    if (lowerBody.includes('not interested') || 
        lowerBody.includes('no thanks') || 
        lowerBody.includes('pass') ||
        lowerBody.includes('don\'t have budget')) {
      return 'not_interested';
    }
    
    // Check for meeting requests
    if (lowerBody.includes('book') || 
        lowerBody.includes('calendar') || 
        lowerBody.includes('schedule') ||
        lowerBody.includes('meet') ||
        lowerBody.includes('call')) {
      return 'meeting_request';
    }
    
    // Check for questions
    if (lowerBody.includes('?') || 
        lowerBody.includes('how much') || 
        lowerBody.includes('pricing') ||
        lowerBody.includes('what is') ||
        lowerBody.includes('can you')) {
      return 'question';
    }
    
    // Check for positive interest
    if (lowerBody.includes('interested') || 
        lowerBody.includes('sounds good') || 
        lowerBody.includes('tell me more') ||
        lowerBody.includes('yes')) {
      return 'interested';
    }
    
    // Check for out of office
    if (lowerBody.includes('out of office') || 
        lowerBody.includes('ooo') || 
        lowerBody.includes('on vacation') ||
        lowerBody.includes('away until')) {
      return 'out_of_office';
    }
    
    return 'neutral';
  }

  async suggestMeeting(contactId) {
    try {
      // Get contact info
      const contact = await db.query(
        'SELECT first_name, email FROM contacts WHERE id = ?',
        [contactId]
      );
      
      if (contact.length === 0) return;
      
      const { first_name, email } = contact[0];
      
      // Send meeting suggestion email
      logger.info(`Sending meeting suggestion to ${email}`);
      
      // This would use the EmailSender to send a follow-up
      // For now, just log it
      
    } catch (error) {
      logger.error('Error suggesting meeting:', error.message);
    }
  }

  async sendAlert(subject, from, body, intent) {
    // Send Telegram/Discord alert about reply
    const alertText = `📧 New Reply Received!\n\nFrom: ${from}\nSubject: ${subject}\nIntent: ${intent}\n\nPreview: ${body.substring(0, 200)}...`;
    
    logger.info(alertText);
    
    // Here you would integrate with Telegram/Discord
  }
}

module.exports = InboundMonitor;
