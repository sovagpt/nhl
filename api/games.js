const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

let cachedGames = null;
let cacheTimestamp = null;
const CACHE_DURATION = 3 * 60 * 1000; // 3 minutes

// NHL team abbreviations to full names mapping
const TEAM_NAMES = {
    'ANA': 'Anaheim Ducks', 'ARI': 'Arizona Coyotes', 'BOS': 'Boston Bruins',
    'BUF': 'Buffalo Sabres', 'CAR': 'Carolina Hurricanes', 'CBJ': 'Columbus Blue Jackets',
    'CGY': 'Calgary Flames', 'CHI': 'Chicago Blackhawks', 'COL': 'Colorado Avalanche',
    'DAL': 'Dallas Stars', 'DET': 'Detroit Red Wings', 'EDM': 'Edmonton Oilers',
    'FLA': 'Florida Panthers', 'LA': 'Los Angeles Kings', 'LAK': 'Los Angeles Kings',
    'MIN': 'Minnesota Wild', 'MTL': 'Montreal Canadiens', 'NJ': 'New Jersey Devils',
    'NJD': 'New Jersey Devils', 'NSH': 'Nashville Predators', 'NYI': 'New York Islanders',
    'NYR': 'New York Rangers', 'OTT': 'Ottawa Senators', 'PHI': 'Philadelphia Flyers',
    'PIT': 'Pittsburgh Penguins', 'SJ': 'San Jose Sharks', 'SJS': 'San Jose Sharks',
    'SEA': 'Seattle Kraken', 'STL': 'St. Louis Blues', 'TB': 'Tampa Bay Lightning',
    'TBL': 'Tampa Bay Lightning', 'TOR': 'Toronto Maple Leafs', 'VAN': 'Vancouver Canucks',
    'VGK': 'Vegas Golden Knights', 'WPG': 'Winnipeg Jets', 'WSH': 'Washington Capitals'
};

async function scrapeDailyFaceoff() {
    // Return cached data if fresh
    if (cachedGames && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
        console.log('Returning cached game data');
        return cachedGames;
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
        
        console.log('Navigating to DailyFaceoff...');
        await page.goto('https://www.dailyfaceoff.com/starting-goalies/', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        console.log('Waiting for content to load...');
        await page.waitForTimeout(3000);
        
        console.log('Extracting game data...');
        const games = await page.evaluate((teamNames) => {
            const gameData = [];
            
            // Find all game matchup containers
            const gameCards = document.querySelectorAll('.starting-goalies-card');
            
            gameCards.forEach(card => {
                try {
                    // Get team names from matchup
                    const matchupEl = card.querySelector('.game-matchup');
                    if (!matchupEl) return;
                    
                    const matchupText = matchupEl.textContent.trim();
                    const matchupMatch = matchupText.match(/([A-Z]{2,3})\s*@\s*([A-Z]{2,3})/);
                    
                    if (!matchupMatch) return;
                    
                    const awayAbbr = matchupMatch[1];
                    const homeAbbr = matchupMatch[2];
                    
                    // Get game time
                    const timeEl = card.querySelector('.game-time');
                    const gameTime = timeEl ? timeEl.textContent.trim().replace(' ET', '') : 'TBD';
                    
                    // Get team logos
                    const teamLogos = card.querySelectorAll('.team-logo img');
                    const awayLogo = teamLogos[0] ? teamLogos[0].src : null;
                    const homeLogo = teamLogos[1] ? teamLogos[1].src : null;
                    
                    // Get goalie info
                    const goalieCards = card.querySelectorAll('.goalie-card');
                    
                    let awayGoalie = { 
                        name: 'TBD', 
                        gaa: '-', 
                        sv_pct: '-', 
                        wins: 0, 
                        losses: 0, 
                        otl: 0, 
                        confirmed: false,
                        photo: null 
                    };
                    
                    let homeGoalie = { 
                        name: 'TBD', 
                        gaa: '-', 
                        sv_pct: '-', 
                        wins: 0, 
                        losses: 0, 
                        otl: 0, 
                        confirmed: false,
                        photo: null 
                    };
                    
                    if (goalieCards.length >= 2) {
                        // Away goalie (first card)
                        const awayCard = goalieCards[0];
                        const awayNameEl = awayCard.querySelector('.goalie-name, .player-name');
                        if (awayNameEl) awayGoalie.name = awayNameEl.textContent.trim();
                        
                        const awayPhotoEl = awayCard.querySelector('img.goalie-image, img.player-image');
                        if (awayPhotoEl) awayGoalie.photo = awayPhotoEl.src;
                        
                        const awayConfirmed = awayCard.querySelector('.confirmed, .status-confirmed');
                        awayGoalie.confirmed = !!awayConfirmed;
                        
                        // Get stats
                        const awayStats = awayCard.querySelectorAll('.stat-value');
                        const awayStatLabels = awayCard.querySelectorAll('.stat-label');
                        
                        awayStats.forEach((stat, idx) => {
                            const label = awayStatLabels[idx]?.textContent.toLowerCase();
                            const value = stat.textContent.trim();
                            
                            if (label?.includes('gaa')) awayGoalie.gaa = value;
                            if (label?.includes('sv%')) awayGoalie.sv_pct = value;
                        });
                        
                        // Get record
                        const awayRecordEl = awayCard.querySelector('.goalie-record, .player-record');
                        if (awayRecordEl) {
                            const recordMatch = awayRecordEl.textContent.match(/(\d+)-(\d+)-(\d+)/);
                            if (recordMatch) {
                                awayGoalie.wins = parseInt(recordMatch[1]);
                                awayGoalie.losses = parseInt(recordMatch[2]);
                                awayGoalie.otl = parseInt(recordMatch[3]);
                            }
                        }
                        
                        // Home goalie (second card)
                        const homeCard = goalieCards[1];
                        const homeNameEl = homeCard.querySelector('.goalie-name, .player-name');
                        if (homeNameEl) homeGoalie.name = homeNameEl.textContent.trim();
                        
                        const homePhotoEl = homeCard.querySelector('img.goalie-image, img.player-image');
                        if (homePhotoEl) homeGoalie.photo = homePhotoEl.src;
                        
                        const homeConfirmed = homeCard.querySelector('.confirmed, .status-confirmed');
                        homeGoalie.confirmed = !!homeConfirmed;
                        
                        const homeStats = homeCard.querySelectorAll('.stat-value');
                        const homeStatLabels = homeCard.querySelectorAll('.stat-label');
                        
                        homeStats.forEach((stat, idx) => {
                            const label = homeStatLabels[idx]?.textContent.toLowerCase();
                            const value = stat.textContent.trim();
                            
                            if (label?.includes('gaa')) homeGoalie.gaa = value;
                            if (label?.includes('sv%')) homeGoalie.sv_pct = value;
                        });
                        
                        const homeRecordEl = homeCard.querySelector('.goalie-record, .player-record');
                        if (homeRecordEl) {
                            const recordMatch = homeRecordEl.textContent.match(/(\d+)-(\d+)-(\d+)/);
                            if (recordMatch) {
                                homeGoalie.wins = parseInt(recordMatch[1]);
                                homeGoalie.losses = parseInt(recordMatch[2]);
                                homeGoalie.otl = parseInt(recordMatch[3]);
                            }
                        }
                    }
                    
                    gameData.push({
                        away_team: teamNames[awayAbbr] || awayAbbr,
                        home_team: teamNames[homeAbbr] || homeAbbr,
                        away_abbr: awayAbbr,
                        home_abbr: homeAbbr,
                        game_time: gameTime,
                        status: 'scheduled',
                        score: null,
                        home_win_prob: "50.0",
                        away_win_prob: "50.0",
                        team_logos: {
                            away: awayLogo,
                            home: homeLogo
                        },
                        goalies: {
                            away: awayGoalie,
                            home: homeGoalie
                        }
                    });
                    
                } catch (err) {
                    console.error('Error parsing game card:', err);
                }
            });
            
            return gameData;
        }, TEAM_NAMES);
        
        console.log(`Found ${games.length} games`);
        
        // Cache the results
        cachedGames = games;
        cacheTimestamp = Date.now();
        
        return games;
        
    } catch (error) {
        console.error('Scraping error:', error);
        return cachedGames || [];
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
        const games = await scrapeDailyFaceoff();
        
        // Add edge calculations based on goalie stats
        const enrichedGames = games.map(game => {
            let edge = null;
            
            if (game.goalies.home.gaa !== "-" && game.goalies.away.gaa !== "-") {
                const homeGAA = parseFloat(game.goalies.home.gaa);
                const awayGAA = parseFloat(game.goalies.away.gaa);
                const homeSV = parseFloat(game.goalies.home.sv_pct);
                const awaySV = parseFloat(game.goalies.away.sv_pct);
                
                if (!isNaN(homeGAA) && !isNaN(awayGAA)) {
                    const gaaDiff = awayGAA - homeGAA;
                    const svDiff = homeSV - awaySV;
                    
                    // Combined edge score
                    const edgeScore = (gaaDiff * 10) + (svDiff * 100);
                    
                    if (Math.abs(edgeScore) > 0.5) {
                        const betterTeam = edgeScore > 0 ? game.home_team : game.away_team;
                        edge = {
                            recommendation: `BET ${betterTeam}`,
                            confidence: Math.abs(edgeScore) > 1.0 ? "HIGH" : "MEDIUM",
                            value: Math.abs(edgeScore).toFixed(1)
                        };
                    }
                }
            }
            
            return {
                ...game,
                id: Math.random().toString(36).substr(2, 9),
                edge
            };
        });
        
        res.status(200).json({
            success: true,
            games: enrichedGames,
            cached: cacheTimestamp ? true : false,
            timestamp: new Date().toISOString(),
            sources: {
                dailyfaceoff: true
            }
        });
        
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            games: []
        });
    }
};
