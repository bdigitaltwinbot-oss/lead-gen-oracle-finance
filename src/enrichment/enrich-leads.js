const axios = require('axios');
const logger = require('../utils/logger');
const db = require('../database/db');

class LeadEnricher {
  constructor() {
    this.hunterApiKey = process.env.HUNTER_API_KEY;
    this.apolloApiKey = process.env.APOLLO_API_KEY;
    this.minConfidence = parseInt(process.env.HUNTER_CONFIDENCE_THRESHOLD) || 80;
  }

  async enrichAll() {
    logger.info('Starting lead enrichment...');
    
    // Get companies that need enrichment
    const companies = await db.query(
      `SELECT * FROM companies 
       WHERE status = 'new' OR email_domain IS NULL
       LIMIT 50`
    );
    
    logger.info(`Found ${companies.length} companies to enrich`);
    
    for (const company of companies) {
      await this.enrichCompany(company);
      // Rate limiting
      await this.sleep(1000);
    }
    
    logger.info('Lead enrichment completed');
  }

  async enrichCompany(company) {
    logger.info(`Enriching: ${company.name}`);
    
    try {
      // Try Hunter.io first
      const hunterData = await this.searchHunter(company.name);
      
      if (hunterData && hunterData.domain) {
        await db.run(
          `UPDATE companies 
           SET email_domain = ?, 
               hunter_data = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
          [hunterData.domain, JSON.stringify(hunterData), company.id]
        );
        
        // Find contacts at this company
        await this.findContacts(company, hunterData.domain);
      }
      
      // Also try Apollo.io for additional data
      const apolloData = await this.searchApollo(company.name);
      if (apolloData) {
        await db.run(
          `UPDATE companies 
           SET apollo_data = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
          [JSON.stringify(apolloData), company.id]
        );
      }
      
      // Mark as enriched
      await db.run(
        `UPDATE companies SET status = 'enriched', updated_at = datetime('now') WHERE id = ?`,
        [company.id]
      );
      
    } catch (error) {
      logger.error(`Error enriching ${company.name}:`, error.message);
    }
  }

  async searchHunter(companyName) {
    if (!this.hunterApiKey) {
      logger.warn('Hunter.io API key not configured');
      return null;
    }
    
    try {
      const response = await axios.get('https://api.hunter.io/v2/domain-search', {
        params: {
          company: companyName,
          api_key: this.hunterApiKey
        }
      });
      
      if (response.data.data) {
        return {
          domain: response.data.data.domain,
          pattern: response.data.data.pattern,
          emails: response.data.data.emails || []
        };
      }
      
    } catch (error) {
      logger.error('Hunter.io API error:', error.message);
    }
    
    return null;
  }

  async findContacts(company, domain) {
    if (!this.hunterApiKey) return;
    
    try {
      // Search for specific job titles
      const titles = ['Finance Director', 'FP&A Manager', 'Financial Analyst', 'Controller', 'CFO'];
      
      for (const title of titles) {
        const response = await axios.get('https://api.hunter.io/v2/email-finder', {
          params: {
            domain: domain,
            company: company.name,
            position: title,
            api_key: this.hunterApiKey
          }
        });
        
        if (response.data.data && response.data.data.email) {
          const email = response.data.data;
          
          // Check confidence score
          if (email.score >= this.minConfidence) {
            await this.saveContact(company.id, {
              firstName: email.first_name,
              lastName: email.last_name,
              email: email.email,
              title: title,
              confidence: email.score,
              source: 'hunter'
            });
          }
        }
        
        await this.sleep(500);
      }
      
    } catch (error) {
      logger.error('Error finding contacts:', error.message);
    }
  }

  async searchApollo(companyName) {
    if (!this.apolloApiKey) {
      logger.warn('Apollo.io API key not configured');
      return null;
    }
    
    try {
      const response = await axios.post('https://api.apollo.io/v1/mixed_companies/search', {
        api_key: this.apolloApiKey,
        q_organization_name: companyName
      });
      
      if (response.data.organizations && response.data.organizations.length > 0) {
        const org = response.data.organizations[0];
        
        // Search for contacts at this organization
        await this.searchApolloContacts(org.id, companyName);
        
        return {
          id: org.id,
          name: org.name,
          website: org.website_url,
          linkedin: org.linkedin_url,
          industry: org.industry,
          size: org.estimated_num_employees
        };
      }
      
    } catch (error) {
      logger.error('Apollo.io API error:', error.message);
    }
    
    return null;
  }

  async searchApolloContacts(organizationId, companyName) {
    try {
      const response = await axios.post('https://api.apollo.io/v1/mixed_people/search', {
        api_key: this.apolloApiKey,
        organization_ids: [organizationId],
        person_titles: ['Finance Director', 'FP&A Manager', 'Financial Analyst', 'Controller', 'CFO', 'VP Finance'],
        per_page: 10
      });
      
      if (response.data.people) {
        for (const person of response.data.people) {
          if (person.email) {
            const company = await db.query('SELECT id FROM companies WHERE name = ?', [companyName]);
            if (company.length > 0) {
              await this.saveContact(company[0].id, {
                firstName: person.first_name,
                lastName: person.last_name,
                email: person.email,
                title: person.title,
                linkedin: person.linkedin_url,
                confidence: person.email_verified ? 100 : 70,
                source: 'apollo'
              });
            }
          }
        }
      }
      
    } catch (error) {
      logger.error('Error searching Apollo contacts:', error.message);
    }
  }

  async saveContact(companyId, contactData) {
    try {
      // Check if contact already exists
      const existing = await db.query(
        'SELECT id FROM contacts WHERE email = ?',
        [contactData.email]
      );
      
      if (existing.length > 0) {
        logger.debug(`Contact already exists: ${contactData.email}`);
        return;
      }
      
      await db.run(
        `INSERT INTO contacts (company_id, first_name, last_name, email, title, linkedin, confidence, source, created_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'ready')`,
        [
          companyId,
          contactData.firstName,
          contactData.lastName,
          contactData.email,
          contactData.title,
          contactData.linkedin || null,
          contactData.confidence,
          contactData.source
        ]
      );
      
      logger.info(`New contact added: ${contactData.firstName} ${contactData.lastName} (${contactData.email})`);
      
    } catch (error) {
      logger.error('Error saving contact:', error.message);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = LeadEnricher;
