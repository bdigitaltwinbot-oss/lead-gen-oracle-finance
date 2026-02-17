const puppeteer = require('puppeteer');
const logger = require('../utils/logger');
const db = require('../database/db');

class JobScraper {
  constructor() {
    this.keywords = process.env.SEARCH_KEYWORDS?.split(',') || [
      'Oracle PBCS',
      'Oracle EPBCS',
      'Oracle Hyperion',
      'Oracle NSPB',
      'Hyperion Planning'
    ];
    this.locations = process.env.SEARCH_LOCATIONS?.split(',') || ['United States', 'Remote'];
  }

  async scrapeAll() {
    logger.info('Starting job scraping...');
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      for (const keyword of this.keywords) {
        for (const location of this.locations) {
          await this.scrapeGoogleJobs(browser, keyword, location);
          // Rate limiting - wait between searches
          await this.sleep(5000);
        }
      }
    } finally {
      await browser.close();
    }
    
    logger.info('Job scraping completed');
  }

  async scrapeGoogleJobs(browser, keyword, location) {
    logger.info(`Scraping: "${keyword}" in "${location}"`);
    
    const page = await browser.newPage();
    
    try {
      // Construct Google Jobs search URL
      const searchQuery = encodeURIComponent(`${keyword} jobs ${location}`);
      const url = `https://www.google.com/search?q=${searchQuery}&ibp=htl;jobs`;
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for job listings to load
      await page.waitForSelector('[data-ved]', { timeout: 10000 }).catch(() => {
        logger.warn(`No job listings found for "${keyword}"`);
        return;
      });
      
      // Extract job listings
      const jobs = await page.evaluate(() => {
        const listings = [];
        const jobElements = document.querySelectorAll('div[data-ved]');
        
        jobElements.forEach((el, index) => {
          if (index > 10) return; // Limit to first 10 per search
          
          const titleEl = el.querySelector('h2, [role="heading"]');
          const companyEl = el.querySelector('[data-brand], .vNEEBe, div[class*="company"]');
          const locationEl = el.querySelector('[class*="location"], .Qk80Jf');
          const dateEl = el.querySelector('span[class*="date"], span[class*="posted"]');
          
          if (titleEl && companyEl) {
            listings.push({
              title: titleEl.textContent?.trim(),
              company: companyEl.textContent?.trim(),
              location: locationEl?.textContent?.trim() || 'Unknown',
              postedDate: dateEl?.textContent?.trim() || 'Unknown',
              source: 'google_jobs',
              keyword: keyword
            });
          }
        });
        
        return listings;
      });
      
      logger.info(`Found ${jobs.length} jobs for "${keyword}"`);
      
      // Save to database
      for (const job of jobs) {
        await this.saveJob(job);
      }
      
    } catch (error) {
      logger.error(`Error scraping "${keyword}":`, error.message);
    } finally {
      await page.close();
    }
  }

  async saveJob(jobData) {
    try {
      // Check if job already exists
      const existing = await db.query(
        'SELECT id FROM jobs WHERE title = ? AND company = ? AND posted_date = ?',
        [jobData.title, jobData.company, jobData.postedDate]
      );
      
      if (existing.length > 0) {
        logger.debug(`Job already exists: ${jobData.title} at ${jobData.company}`);
        return;
      }
      
      // Insert new job
      const result = await db.run(
        `INSERT INTO jobs (title, company, location, posted_date, source, keyword, created_at, status)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'new')`,
        [jobData.title, jobData.company, jobData.location, jobData.postedDate, jobData.source, jobData.keyword]
      );
      
      logger.info(`New job saved: ${jobData.title} at ${jobData.company}`);
      
      // Also create or update company record
      await this.saveCompany(jobData.company, jobData.location);
      
    } catch (error) {
      logger.error('Error saving job:', error.message);
    }
  }

  async saveCompany(companyName, location) {
    try {
      const existing = await db.query(
        'SELECT id FROM companies WHERE name = ?',
        [companyName]
      );
      
      if (existing.length === 0) {
        await db.run(
          `INSERT INTO companies (name, location, created_at, status)
           VALUES (?, ?, datetime('now'), 'new')`,
          [companyName, location]
        );
        logger.info(`New company added: ${companyName}`);
      }
    } catch (error) {
      logger.error('Error saving company:', error.message);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = JobScraper;
