import express from 'express';
import cors from 'cors';
import process from 'node:process';
import puppeteer from 'puppeteer';

const app = express();
const port = process.env.PORT || 3000;

// Allow multiple local origins for dev flexibility
const localOrigins = ['http://localhost:4200', 'http://localhost:8080'];
const allowedOrigin = process.env.ALLOWED_ORIGIN || (process.env.NODE_ENV === 'production' ? 'https://padel.pokebot.at' : localOrigins);

app.use(cors({
    origin: allowedOrigin
}));

// In-memory cache and in-flight request tracking
const fetchCache = new Map();
const inFlightRequests = new Map();
const CACHE_DURATION = 10000; // 10 seconds

let browser;

async function initBrowser() {
    if (browser) return browser;
    console.log('Initializing Puppeteer browser singleton...');
    browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('Puppeteer browser launched.');
    return browser;
}

app.get('/slots', async (req, res) => {
    const startDate = req.query.startDate;
    if (!startDate) {
        return res.status(500).json({ error: 'Start date not set' });
    }

    // 1. Check if we have a valid cache entry
    const now = Date.now();
    const cached = fetchCache.get(startDate);
    if (cached && (now - cached.timestamp < CACHE_DURATION)) {
        console.log(`[Cache] Serving ${startDate}`);
        return res.json(cached.data);
    }

    // 2. Check if a request for this date is already in progress (Coalescing)
    if (inFlightRequests.has(startDate)) {
        console.log(`[Coalesce] Waiting for in-flight request: ${startDate}`);
        try {
            const data = await inFlightRequests.get(startDate);
            return res.json(data);
        } catch (err) {
            // If the original request failed, handle it here
            return res.status(500).json({ error: 'Failed to fetch slots (coalesced)', details: err.message });
        }
    }

    // 3. Start a new request
    let page;
    const fetchPromise = (async () => {
        try {
            if (!browser) {
                await initBrowser();
            }

            page = await browser.newPage();

            await page.setRequestInterception(true);
            page.on('request', (request) => {
                const resourceType = request.resourceType();
                if (['image', 'stylesheet', 'font', 'media', 'other'].includes(resourceType)) {
                    request.abort();
                } else {
                    request.continue();
                }
            });

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');

            const apiUrl = `https://www.eversports.at/api/slot?facilityId=82679&startDate=${encodeURIComponent(startDate)}&courts%5B%5D=110271&courts%5B%5D=110272&courts%5B%5D=110273`;

            const response = await page.goto(apiUrl, { waitUntil: 'networkidle2' });
            const data = await response.json();

            // Store in cache
            fetchCache.set(startDate, {
                timestamp: Date.now(),
                data: data
            });

            console.log(`[Puppeteer] Successfully fetched slots for ${startDate}`);
            return data;
        } finally {
            if (page) {
                await page.close().catch(err => console.error('Error closing page:', err));
            }
            // Remove from in-flight once finished
            inFlightRequests.delete(startDate);
        }
    })();

    // Register the promise for coalescing
    inFlightRequests.set(startDate, fetchPromise);

    try {
        const result = await fetchPromise;
        res.json(result);
    } catch (error) {
        console.error(`[Error] ${startDate}:`, error);
        res.status(500).json({ error: 'Failed to fetch slots', details: error.message });
    }
});

app.listen(port, async () => {
    const host = process.env.NODE_ENV === 'production' ? 'https://padelapi.pokebot.at' : `http://localhost:${port}`;
    console.log(`Server running at ${host}`);

    // Pre-initialize browser on startup
    try {
        await initBrowser();
    } catch (err) {
        console.error('Failed to pre-initialize browser:', err);
    }
});
