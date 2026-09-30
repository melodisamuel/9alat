const axios = require('axios');

const REMOTEOK_API_URL = 'https://remoteok.com/api';

function stripHtml(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Fetches recent job postings from RemoteOK public API and normalizes them.
 * @returns {Promise<Array<Object>>} Normalized job objects list
 */
async function fetchRemoteOkJobs() {
  try {
    const response = await axios.get(REMOTEOK_API_URL, {
      headers: {
        'User-Agent': 'QAJobAlertBot/1.0 (Personal Job Search System)',
        'Accept': 'application/json, text/plain, */*'
      },
      timeout: 10000
    });

    if (!response || !Array.isArray(response.data)) {
      return [];
    }

    const items = [];

    for (const item of response.data) {
      if (!item || item.legal || !item.position || (!item.url && !item.apply_url)) {
        continue;
      }

      const title = String(item.position || 'Untitled Role').trim();
      const company = String(item.company || 'RemoteOK Listing').trim();
      const location = String(item.location || 'Remote').trim();
      const url = String(item.url || item.apply_url || '').trim();
      const rawDesc = String(item.description || '').trim();
      const description = stripHtml(rawDesc);

      let publishedAt = new Date().toISOString();
      if (item.date) {
        const parsedDate = new Date(item.date);
        if (!isNaN(parsedDate.getTime())) {
          publishedAt = parsedDate.toISOString();
        }
      } else if (item.epoch) {
        const parsedDate = new Date(item.epoch * 1000);
        if (!isNaN(parsedDate.getTime())) {
          publishedAt = parsedDate.toISOString();
        }
      }

      if (title && url) {
        items.push({
          title,
          company,
          location: location || 'Remote',
          url,
          description,
          source: 'remoteok',
          publishedAt
        });
      }
    }

    return items;
  } catch (error) {
    console.error(`[RemoteOK Source Warning] Failed to fetch RemoteOK jobs: ${error.message}`);
    return [];
  }
}

module.exports = {
  fetchRemoteOkJobs
};
