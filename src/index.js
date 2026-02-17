require('dotenv').config();

const db = require('./database/db');
const JobScraper = require('./scrapers/job-scraper');
const LeadEnricher = require('./enrichment/enrich-leads');
const EmailSender = require('./outreach/send-emails');
const InboundMonitor = require('./monitor/inbound-monitor');
const CalendarManager = require('./calendar/book-meeting');
const logger = require('./utils/logger');

async function main() {
  logger.info('═══════════════════════════════════════════');
  logger.info('  Lead Generation System - Oracle Finance');
  logger.info('═══════════════════════════════════════════\n');
  
  // Initialize database
  await db.initialize();
  
  // Get command
  const command = process.argv[2];
  
  switch (command) {
    case 'scrape':
      const scraper = new JobScraper();
      await scraper.scrapeAll();
      break;
      
    case 'enrich':
      const enricher = new LeadEnricher();
      await enricher.enrichAll();
      break;
      
    case 'send':
      const sender = new EmailSender();
      await sender.initialize();
      await sender.sendDailyBatch();
      break;
      
    case 'monitor':
      const monitor = new InboundMonitor();
      await monitor.initialize();
      await monitor.checkForReplies();
      break;
      
    case 'calendar':
      const calendar = new CalendarManager();
      await calendar.initialize();
      // Example: create meeting for contact ID 1
      // await calendar.createMeeting(1);
      break;
      
    case 'daemon':
      await runDaemon();
      break;
      
    default:
      logger.info('Usage: npm start [scrape|enrich|send|monitor|calendar|daemon]');
      logger.info('');
      logger.info('Commands:');
      logger.info('  scrape   - Scrape job postings');
      logger.info('  enrich   - Enrich leads with Hunter/Apollo');
      logger.info('  send     - Send outreach emails (max 10/day)');
      logger.info('  monitor  - Check for email replies');
      logger.info('  calendar - Manage calendar bookings');
      logger.info('  daemon   - Run continuous monitoring');
  }
  
  await db.close();
}

async function runDaemon() {
  logger.info('Starting daemon mode...');
  
  const sender = new EmailSender();
  await sender.initialize();
  
  const monitor = new InboundMonitor();
  await monitor.initialize();
  
  // Schedule daily email sending (9 AM)
  const cron = require('node-cron');
  
  cron.schedule('0 9 * * 1-5', async () => {
    logger.info('Scheduled: Sending daily emails');
    await sender.sendDailyBatch();
  });
  
  // Schedule reply checking (every 30 minutes)
  cron.schedule('*/30 * * * *', async () => {
    logger.info('Scheduled: Checking for replies');
    await monitor.checkForReplies();
  });
  
  logger.info('Daemon running. Press Ctrl+C to stop.');
  
  // Keep process alive
  process.stdin.resume();
}

main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
