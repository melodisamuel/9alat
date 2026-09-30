const axios = require('axios');
const { SEARCH_QUERIES } = require('../config/searchQueries');

const DJINNI_RSS_BASE_URL = 'https://djinni.co/jobs/rss/';

function decodeEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripHtml(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parses RSS XML into normalized job objects safely handling missing or malformed tags.
 * @param {string} xmlString 
 * @returns {Array<Object>} Normalized jobs list
 */
function parseRssXml(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') {
    return [];
  }

  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xmlString)) !== null) {
    const itemBlock = match[1];

    const titleMatch = itemBlock.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = itemBlock.match(/<link>([\s\S]*?)<\/link>/i) || itemBlock.match(/<guid[\s\S]*?>([\s\S]*?)<\/guid>/i);
    const descMatch = itemBlock.match(/<description>([\s\S]*?)<\/description>/i);
    const pubDateMatch = itemBlock.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : 'Untitled Role';
    const url = linkMatch ? decodeEntities(linkMatch[1].trim()) : '';
    const rawDesc = descMatch ? decodeEntities(descMatch[1].trim()) : '';
    const description = stripHtml(rawDesc);

    let publishedAt = new Date().toISOString();
    if (pubDateMatch && pubDateMatch[1]) {
      const parsedDate = new Date(pubDateMatch[1].trim());
      if (!isNaN(parsedDate.getTime())) {
        publishedAt = parsedDate.toISOString();
      }
    }

    let company = 'Djinni Listing';
    const strongMatch = rawDesc.match(/<strong>(.*?)<\/strong>/i);
    if (strongMatch && strongMatch[1] && strongMatch[1].length < 50 && !/Requirements|Work Format|What We Offer/i.test(strongMatch[1])) {
      company = stripHtml(decodeEntities(strongMatch[1]));
    }

    let location = 'Remote / Unspecified';
    if (/remote|віддально|віддалений|remotely/i.test(description)) {
      location = 'Remote';
    } else if (/kyiv|київ/i.test(description)) {
      location = 'Kyiv';
    } else if (/wrocław|wroclaw/i.test(description) || /wroclaw/i.test(title)) {
      location = 'Wrocław';
    }

    if (url && title) {
      items.push({
        title,
        company,
        location,
        url,
        description,
        source: 'djinni',
        publishedAt
      });
    }
  }

  return items;
}

/**
 * Fetches jobs for a single query term from Djinni RSS feed.
 * @param {string} query 
 * @returns {Promise<Array<Object>>} List of normalized jobs
 */
async function fetchDjinniJobsForQuery(query) {
  try {
    const url = `${DJINNI_RSS_BASE_URL}?primary_keyword=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'QAJobAlertBot/1.0 (Personal Job Search System)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      timeout: 10000
    });

    if (!response || !response.data) {
      return [];
    }

    return parseRssXml(response.data);
  } catch (error) {
    console.warn(`[Djinni Source Warning] Query "${query}" failed: ${error.message}`);
    return [];
  }
}

/**
 * Fetches recent QA job postings from Djinni across configured search queries, deduplicating in-memory by URL.
 * @param {Array<string>} queries - List of search query strings
 * @returns {Promise<Array<Object>>} Deduplicated normalized jobs list
 */
async function fetchDjinniJobs(queries = SEARCH_QUERIES) {
  const jobsByUrl = new Map();

  for (const query of queries) {
    const queryJobs = await fetchDjinniJobsForQuery(query);
    for (const job of queryJobs) {
      if (!jobsByUrl.has(job.url)) {
        jobsByUrl.set(job.url, job);
      }
    }
  }

  return Array.from(jobsByUrl.values());
}

module.exports = {
  fetchDjinniJobs,
  fetchDjinniJobsForQuery,
  parseRssXml
};
