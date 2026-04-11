// Link audit script for visionbleu-links.netlify.app
const { chromium } = require('playwright');

const EXPECTED_LINKS = [
  {
    label: 'Book A Call with Us',
    expectedDomain: 'leadconnectorhq.com',
    type: 'main-button'
  },
  {
    label: 'Contact Us',
    expectedUrl: 'https://visionbleu.com/contact-us',
    type: 'main-button'
  },
  {
    label: 'Residential Lighting Projects',
    expectedDomain: 'drive.google.com',
    type: 'secondary-link'
  },
  {
    label: 'Commercial Lighting Showcase',
    expectedDomain: 'drive.google.com',
    type: 'secondary-link'
  },
  {
    label: 'Product Catalogue',
    expectedDomain: 'drive.google.com',
    type: 'secondary-link'
  },
  {
    label: 'Instagram',
    expectedUrl: 'https://instagram.com/visionbleuled',
    type: 'social'
  },
  {
    label: 'Facebook',
    expectedDomain: 'facebook.com',
    type: 'social'
  },
  {
    label: 'TikTok',
    expectedDomain: 'tiktok.com',
    type: 'social'
  },
  {
    label: 'YouTube',
    expectedDomain: 'youtube.com',
    type: 'social'
  },
  {
    label: 'Email',
    expectedUrl: 'mailto:contact@visionbleu.com',
    type: 'social'
  }
];

async function auditLinks() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    const startTime = Date.now();
    const response = await page.goto('https://visionbleu-links.netlify.app', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    const loadTime = Date.now() - startTime;

    const statusCode = response.status();
    console.log(`Page load: ${loadTime}ms, Status: ${statusCode}`);

    // Get all anchor tags
    const anchors = await page.$$eval('a', (els) =>
      els.map((el) => ({
        text: el.textContent?.trim(),
        href: el.getAttribute('href'),
        ariaLabel: el.getAttribute('aria-label'),
        title: el.getAttribute('title'),
        rel: el.getAttribute('rel'),
        target: el.getAttribute('target')
      }))
    );

    console.log('\n=== ALL ANCHOR TAGS FOUND ===');
    anchors.forEach((a, i) => {
      console.log(`[${i}] text="${a.text}" href="${a.href}" aria-label="${a.ariaLabel}" target="${a.target}"`);
    });

    // Check page title
    const title = await page.title();
    console.log(`\nPage title: "${title}"`);

    // Check meta description
    const metaDesc = await page.$eval(
      'meta[name="description"]',
      (el) => el.content
    ).catch(() => null);
    console.log(`Meta description: "${metaDesc}"`);

    // Check for logo/image
    const images = await page.$$eval('img', (els) =>
      els.map((el) => ({ src: el.src, alt: el.alt, width: el.naturalWidth, height: el.naturalHeight }))
    );
    console.log(`\nImages found: ${images.length}`);
    images.forEach((img) => console.log(`  src="${img.src}" alt="${img.alt}" size=${img.width}x${img.height}`));

    // Check semantic HTML
    const headings = await page.$$eval('h1, h2, h3', (els) =>
      els.map((el) => ({ tag: el.tagName, text: el.textContent?.trim() }))
    );
    console.log(`\nHeadings: ${headings.length}`);
    headings.forEach((h) => console.log(`  <${h.tag}> "${h.text}"`));

    // Verify specific expected links
    console.log('\n=== LINK VERIFICATION ===');
    for (const expected of EXPECTED_LINKS) {
      const anchor = anchors.find((a) => {
        const text = (a.text || a.ariaLabel || a.title || '').toLowerCase();
        return text.includes(expected.label.toLowerCase());
      });

      if (!anchor) {
        console.log(`FAIL: "${expected.label}" — not found on page`);
        results.push({ label: expected.label, status: 'FAIL', reason: 'Not found on page' });
        continue;
      }

      const href = anchor.href || '';

      if (expected.expectedUrl) {
        if (href === expected.expectedUrl || href.startsWith(expected.expectedUrl)) {
          console.log(`PASS: "${expected.label}" → ${href}`);
          results.push({ label: expected.label, status: 'PASS', href });
        } else {
          console.log(`FAIL: "${expected.label}" → expected "${expected.expectedUrl}" but got "${href}"`);
          results.push({ label: expected.label, status: 'FAIL', reason: `Wrong URL: ${href}` });
        }
      } else if (expected.expectedDomain) {
        if (href.includes(expected.expectedDomain)) {
          console.log(`PASS: "${expected.label}" → ${href}`);
          results.push({ label: expected.label, status: 'PASS', href });
        } else {
          console.log(`FAIL: "${expected.label}" → expected domain "${expected.expectedDomain}" but got "${href}"`);
          results.push({ label: expected.label, status: 'FAIL', reason: `Wrong domain: ${href}` });
        }
      }
    }

    // Check for Projects Map
    const projectsMap = anchors.find((a) =>
      (a.text || '').toLowerCase().includes('map') ||
      (a.ariaLabel || '').toLowerCase().includes('map')
    );
    if (projectsMap) {
      console.log(`INFO: Projects Map link → "${projectsMap.href}"`);
      results.push({
        label: 'Projects Map',
        status: projectsMap.href === '#' || !projectsMap.href ? 'WARN' : 'PASS',
        href: projectsMap.href,
        reason: projectsMap.href === '#' ? 'Placeholder href=#' : null
      });
    } else {
      console.log('INFO: Projects Map — not found on page (may not be implemented yet)');
      results.push({ label: 'Projects Map', status: 'NOT_FOUND', reason: 'Not on page' });
    }

    // Open graph / social sharing
    const ogTitle = await page.$eval('meta[property="og:title"]', (el) => el.content).catch(() => null);
    const ogImage = await page.$eval('meta[property="og:image"]', (el) => el.content).catch(() => null);
    console.log(`\nOG Title: "${ogTitle}"`);
    console.log(`OG Image: "${ogImage}"`);

    // Check for broken external links (just HEAD requests)
    const externalLinks = anchors.filter(
      (a) => a.href && a.href.startsWith('http') && !a.href.includes('drive.google.com')
    );

    console.log(`\n=== EXTERNAL LINK HEAD CHECKS (${externalLinks.length}) ===`);
    const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

    for (const link of externalLinks.slice(0, 10)) {
      try {
        const res = await fetch(link.href, {
          method: 'HEAD',
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (audit bot)' },
          signal: AbortSignal.timeout(8000)
        });
        const finalUrl = res.url;
        console.log(`  [${res.status}] ${link.href}${finalUrl !== link.href ? ` → ${finalUrl}` : ''}`);
      } catch (err) {
        console.log(`  [ERR] ${link.href} — ${err.message}`);
      }
    }

    console.log(`\nLoad time: ${loadTime}ms`);
    console.log(`HTTP Status: ${statusCode}`);

    return { loadTime, statusCode, anchors, headings, images, results };
  } finally {
    await browser.close();
  }
}

auditLinks().catch(console.error);
