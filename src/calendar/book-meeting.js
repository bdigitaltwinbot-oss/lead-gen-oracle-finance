const { google } = require('googleapis');
const logger = require('../utils/logger');
const db = require('../database/db');

class CalendarManager {
  constructor() {
    this.calendar = null;
    this.oauth2Client = null;
    this.calendarId = process.env.CALENDAR_ID || 'primary';
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
    
    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    
    logger.info('Calendar manager initialized');
  }

  async createMeeting(contactId, suggestedTimes = []) {
    try {
      // Get contact info
      const contact = await db.query(
        `SELECT c.first_name, c.last_name, c.email, comp.name as company_name
         FROM contacts c
         JOIN companies comp ON c.company_id = comp.id
         WHERE c.id = ?`,
        [contactId]
      );
      
      if (contact.length === 0) {
        logger.error(`Contact ${contactId} not found`);
        return null;
      }
      
      const { first_name, last_name, email, company_name } = contact[0];
      
      // Find available slot
      const meetingTime = suggestedTimes.length > 0 
        ? new Date(suggestedTimes[0])
        : await this.findNextAvailableSlot();
      
      if (!meetingTime) {
        logger.error('No available meeting slots found');
        return null;
      }
      
      const duration = parseInt(process.env.MEETING_DURATION_MINUTES) || 30;
      const endTime = new Date(meetingTime.getTime() + duration * 60000);
      
      // Create calendar event
      const event = {
        summary: `Intersection Data Finance - ${company_name}`,
        description: `Introduction call with ${first_name} ${last_name} from ${company_name}\n\n` +
          `Agenda:\n` +
          `• Quick intro to Intersection Data Finance\n` +
          `• Your current Oracle PBCS/Hyperion setup\n` +
          `• Challenges you're facing\n` +
          `• How we might help\n\n` +
          `Contact: ${email}`,
        start: {
          dateTime: meetingTime.toISOString(),
          timeZone: process.env.TIMEZONE || 'America/Chicago'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: process.env.TIMEZONE || 'America/Chicago'
        },
        attendees: [
          { email: email, displayName: `${first_name} ${last_name}` }
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 1440 }, // 24 hours
            { method: 'popup', minutes: 15 }
          ]
        },
        conferenceData: {
          createRequest: {
            requestId: `meeting-${contactId}-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      };
      
      const response = await this.calendar.events.insert({
        calendarId: this.calendarId,
        resource: event,
        sendUpdates: 'all',
        conferenceDataVersion: 1
      });
      
      // Save to database
      await db.run(
        `INSERT INTO meetings (contact_id, calendar_event_id, meeting_time, duration_minutes, status, created_at)
         VALUES (?, ?, ?, ?, 'scheduled', datetime('now'))`,
        [contactId, response.data.id, meetingTime.toISOString(), duration]
      );
      
      // Update contact status
      await db.run(
        `UPDATE contacts SET status = 'meeting_scheduled', updated_at = datetime('now') WHERE id = ?`,
        [contactId]
      );
      
      logger.info(`✓ Meeting scheduled with ${first_name} ${last_name} at ${meetingTime}`);
      
      return {
        eventId: response.data.id,
        meetLink: response.data.conferenceData?.entryPoints?.[0]?.uri,
        meetingTime: meetingTime
      };
      
    } catch (error) {
      logger.error('Error creating meeting:', error.message);
      return null;
    }
  }

  async findNextAvailableSlot() {
    try {
      // Look for slots in next 5 business days
      const now = new Date();
      const startOfDay = new Date(now.setHours(9, 0, 0, 0));
      
      // Try each day
      for (let day = 1; day <= 5; day++) {
        const checkDate = new Date(startOfDay);
        checkDate.setDate(checkDate.getDate() + day);
        
        // Skip weekends
        if (checkDate.getDay() === 0 || checkDate.getDay() === 6) continue;
        
        // Check available times (9 AM, 11 AM, 2 PM, 4 PM)
        const timeSlots = [9, 11, 14, 16];
        
        for (const hour of timeSlots) {
          const slotStart = new Date(checkDate);
          slotStart.setHours(hour, 0, 0, 0);
          
          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotEnd.getMinutes() + 30);
          
          // Check if slot is free
          const isFree = await this.isTimeSlotFree(slotStart, slotEnd);
          
          if (isFree) {
            return slotStart;
          }
        }
      }
      
      return null;
      
    } catch (error) {
      logger.error('Error finding available slot:', error.message);
      return null;
    }
  }

  async isTimeSlotFree(startTime, endTime) {
    try {
      const response = await this.calendar.freebusy.query({
        requestBody: {
          timeMin: startTime.toISOString(),
          timeMax: endTime.toISOString(),
          items: [{ id: this.calendarId }]
        }
      });
      
      const busySlots = response.data.calendars[this.calendarId].busy;
      return busySlots.length === 0;
      
    } catch (error) {
      logger.error('Error checking availability:', error.message);
      return false;
    }
  }

  async sendCalendarLink(contactId) {
    // Send email with calendar booking link (like Calendly)
    // This would integrate with the email sender
    logger.info(`Sending calendar link to contact ${contactId}`);
  }
}

module.exports = CalendarManager;
