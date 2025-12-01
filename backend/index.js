import express from 'express';
import puppeteer from 'puppeteer';
import cors from 'cors';

const app = express();
const port = 3000;

app.use(cors({
    origin: 'https://padel.pokebot.at'
}));

app.get('/slots', async (req, res) => {
    let browser;
    try {
        const startDate = req.query.startDate;
        if (!startDate) {
            return res.status(500).json({ error: 'Start date not set' });
        }
        const apiUrl = `https://www.eversports.at/api/slot?facilityId=82679&startDate=${encodeURIComponent(startDate)}&courts%5B%5D=110271&courts%5B%5D=110272&courts%5B%5D=110273`;

        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'accept-language': 'en-US,en;q=0.9'
        });

        const response = await page.goto(apiUrl, { waitUntil: 'networkidle2' });
        const data = await response.json();

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch slots' });
        console.error(error)
    } finally {
        if (browser) await browser.close();
    }
});

app.listen(port, () => {
    console.log(`Server running at https://padelapi.pokebot.at:${port}`);
});
