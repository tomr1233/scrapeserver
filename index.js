import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
app.use(express.json());

// Base URL and routes array (from your React app):
const baseUrl = "https://expressnext.app";
const routes = [
  { path: "/", name: "Home" },
  { path: "/use-cases", name: "Use Cases" },
  { path: "/resources", name: "Resources" },
  { path: "/about", name: "About" },
  { path: "/services/sms", name: "SMS Marketing" },
  { path: "/services/email", name: "Email Marketing" },
  { path: "/services/automation", name: "Automation" },
  { path: "/docs", name: "Developer Docs" },
  { path: "/articles/more-time-on-moneymaking-operations", name: "Automating Customer Support" },
  { path: "/articles/mass-marketing-doesnt-work", name: "Mass Marketing Doesn't Work" },
  { path: "/articles/build-a-personalized-ai-chatbot", name: "Build Personalized AI Chatbot" },
  { path: "/articles/perfect-client", name: "Perfect Client" },
];

// Your Make / Integromat webhook URL
const webhookUrl = "https://hook.us1.make.com/ei6kt5n8hdp5ibee2qi0q2q6uqrv2dny";

/**
 * scrapeAll()
 * 
 * Launches Puppeteer once, iterates over every route, scrapes the FAQ items,
 * and sends each route's data to your Make webhook. Returns the entire set
 * of scraped results.
 */
async function scrapeAll() {
  const browser = await puppeteer.launch({
    headless: true,
    // On some Linux servers (like AWS EC2), you might need additional launch args:
    // args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  let scrapedResults = [];

  for (const route of routes) {
    const url = `${baseUrl}${route.path}`;
    try {
      console.log(`Visiting ${url}...`);
      await page.goto(url, { waitUntil: 'networkidle2' });

      // Wait for at least one FAQ container (10s timeout)
      await page.waitForSelector('.border-b.border-white\\/10', { timeout: 10000 });

      // Grab all FAQ items
      const faqItems = await page.$$('.border-b.border-white\\/10');
      const faqData = [];

      for (const item of faqItems) {
        // Extract question text
        let questionText;
        try {
          questionText = await item.$eval('button span', (el) => el.textContent.trim());
        } catch (err) {
          console.warn("No question <span> found in one FAQ item. Skipping this item.");
          continue;
        }

        // Click to reveal the answer
        const button = await item.$('button');
        if (!button) {
          console.warn("No button found in this FAQ item. Skipping.");
          continue;
        }
        await button.click();

        // Wait for the answer <p> to be visible
        let answerText = '';
        try {
          await item.waitForSelector(':scope p.pb-6.text-gray-400.whitespace-pre-line', {
            visible: true,
            timeout: 5000,
          });
          answerText = await item.$eval(
            ':scope p.pb-6.text-gray-400.whitespace-pre-line',
            (el) => el.textContent.trim()
          );
        } catch (err) {
          console.warn(`No visible answer <p> found for question: "${questionText}".`);
        }

        faqData.push({ question: questionText, answer: answerText });
      }

      // Optionally capture the full text content of the page
      const pageContent = await page.evaluate(() => document.body.innerText);

      // Build our data object for this route
      const routeData = { url, faqData, pageContent };
      scrapedResults.push(routeData);

      // Send the scraped data to the Make webhook
      console.log(`Sending scraped data for ${url} to webhook...`);
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(routeData),
        });
        console.log(`Webhook response status for ${url}:`, response.status);

        if (response.ok) {
          console.log(`Data for ${url} sent to Make webhook successfully!`);
        } else {
          console.error(`Failed to send data for ${url} to Make webhook:`, response.statusText);
        }
      } catch (error) {
        console.error(`Error sending data for ${url} to Make webhook:`, error);
      }

      console.log(`Scraped FAQs from ${url}`);
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
    }
  }

  // Close the browser session
  await browser.close();

  // Return the collected data if you need it in the API response
  return scrapedResults;
}

/**
 * GET /scrape
 * 
 * Triggers our scrapeAll() function, returns JSON with all collected results.
 */
app.get('/scrape', async (req, res) => {
  try {
    const results = await scrapeAll();
    return res.json({
      message: 'Scrape complete.',
      results,
    });
  } catch (err) {
    console.error('Scrape error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Start the server on port 3000 (or whatever is in process.env.PORT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Puppeteer API server running on port ${PORT}`);
});
