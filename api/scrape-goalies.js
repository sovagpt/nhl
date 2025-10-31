const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

let cachedGoalies = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function scrapeGoaliePost() {
    // Return cached data if recent
    if (cachedGoalies && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
        console.log('Returning cached goalie data');
        return cachedGoalies;
    }
    
    let browser = null;
    
    try {
        console.log('Launching browser...');
        
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });
        
        const page = await browser.newPage();
        
        console.log('Navigating to GoaliePost...');
        await page.goto('https://goaliepost.com', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        
        console.log('Waiting for content...');
        // Wait for Flutter app to render
        await page.waitForTimeout(3000);
        
        console.log('Extracting goalie data...');
        const goalies = await page.evaluate(() => {
            const data = [];
            
            // Look for game containers (adjust selectors based on actual DOM)
            const gameCards = document.querySelectorAll('[class*="game"], [class*="match"]');
            
            gameCards.forEach(card => {
                const text = card.innerText;
                
                // Extract team abbreviations and goalie names
                const lines = text.split('\n');
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    
                    // Look for confirmed status
                    if (line.includes('CONFIRMED') || line.includes('CONFIRMED')) {
                        // Previous line might be goalie name
                        const goalieName = lines[i - 1]?.trim();
                        
                        // Look for stats in nearby lines
                        let gaa = 'N/A', svPct = 'N/A', record = '0-0-0';
                        
                        for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 5); j++) {
                            if (lines[j].includes('GAA')) {
                                const match = lines[j].match(/[\d.]+/);
                                if (match) gaa = match[0];
                            }
                            if (lines[j].includes('SV%')) {
                                const match = lines[j].match(/[\d.]+/);
                                if (match) svPct = match[0];
                            }
                            if (/\d+-\d+-\d+/.test(lines[j])) {
                                record = lines[j].match(/\d+-\d+-\d+/)[0];
                            }
                        }
                        
                        if (goalieName) {
                            const [wins, losses, otl] = record.split('-').map(n => parseInt(n) || 0);
                            
                            data.push({
                                name: goalieName,
                                confirmed: true,
                                gaa: gaa,
                                sv_pct: svPct,
                                wins: wins,
                                losses: losses,
                                otl: otl,
                                raw_text: text
                            });
                        }
                    }
                }
            });
            
            return data;
        });
        
        console.log(`Found ${goalies.length} confirmed goalies`);
        
        // Cache the results
        cachedGoalies = goalies;
        cacheTimestamp = Date.now();
        
        return goalies;
        
    } catch (error) {
        console.error('Scraping error:', error);
        return cachedGoalies || []; // Return cached data if available
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    
    try {
        const goalies = await scrapeGoaliePost();
        
        res.status(200).json({
            success: true,
            goalies: goalies,
            cached: cacheTimestamp ? true : false,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            goalies: []
        });
    }
};
