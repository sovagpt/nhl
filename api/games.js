const https = require('https');
const http = require('http');

// Helper to make HTTP requests
function fetch(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Normalize team names
function normalizeTeam(name) {
    const map = {
        'BOS': 'Bruins', 'BUF': 'Sabres', 'CGY': 'Flames', 'OTT': 'Senators',
        'TBL': 'Lightning', 'TB': 'Lightning', 'DAL': 'Stars', 'NYR': 'Rangers',
        'EDM': 'Oilers', 'NJD': 'Devils', 'NJ': 'Devils', 'SJS': 'Sharks',
        'SJ': 'Sharks', 'TOR': 'Maple Leafs', 'MTL': 'Canadiens', 'PIT': 'Penguins'
    };
    
    const upper = name.toUpperCase().trim();
    if (map[upper]) return map[upper];
    
    const words = name.split(' ');
    return words[words.length - 1];
}

// Scrape NHL schedule from NHL API
async function getNHLSchedule() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const url = `https://api-web.nhle.com/v1/schedule/${today}`;
        const data = await fetch(url);
        const json = JSON.parse(data);
        
        const games = [];
        if (json.gameWeek && json.gameWeek.length > 0) {
            for (const week of json.gameWeek) {
                if (week.games) {
                    for (const game of week.games) {
                        games.push({
                            id: game.id,
                            home_team: game.homeTeam.placeName.default + ' ' + game.homeTeam.commonName.default,
                            away_team: game.awayTeam.placeName.default + ' ' + game.awayTeam.commonName.default,
                            home_abbr: game.homeTeam.abbrev,
                            away_abbr: game.awayTeam.abbrev,
                            game_time: new Date(game.startTimeUTC).toLocaleTimeString('en-US', { 
                                hour: 'numeric', 
                                minute: '2-digit',
                                timeZone: 'America/New_York'
                            }),
                            status: game.gameState === 'LIVE' || game.gameState === 'CRIT' ? 'live' : 'scheduled',
                            score: game.homeTeam.score && game.awayTeam.score ? 
                                `${game.awayTeam.score} - ${game.homeTeam.score}` : null
                        });
                    }
                }
            }
        }
        
        return games;
    } catch (error) {
        console.error('Error fetching NHL schedule:', error);
        return [];
    }
}

// Get Polymarket odds
async function getPolymarketOdds() {
    try {
        const url = 'https://clob.polymarket.com/markets';
        const data = await fetch(url);
        const markets = JSON.parse(data);
        
        const nhlMarkets = [];
        const keywords = ['NHL', 'hockey', 'Bruins', 'Sabres', 'Flames', 'Senators', 
                         'Lightning', 'Stars', 'Rangers', 'Oilers', 'Devils', 'Sharks'];
        
        for (const market of markets) {
            const question = market.question || '';
            if (keywords.some(k => question.includes(k))) {
                nhlMarkets.push({
                    question,
                    tokens: market.tokens || [],
                    volume: market.volume || 0
                });
            }
        }
        
        return nhlMarkets;
    } catch (error) {
        console.error('Error fetching Polymarket:', error);
        return [];
    }
}

// Calculate win probability (simplified model)
function calculateWinProb(homeTeam, awayTeam, goalies) {
    let homeProb = 50;
    let awayProb = 50;
    
    if (goalies && goalies.home && goalies.away) {
        const homeGAA = parseFloat(goalies.home.gaa) || 3.0;
        const awayGAA = parseFloat(goalies.away.gaa) || 3.0;
        
        const gaaDiff = awayGAA - homeGAA;
        homeProb = 50 + (gaaDiff * 5);
        awayProb = 100 - homeProb;
    }
    
    return { homeProb: Math.max(20, Math.min(80, homeProb)), 
             awayProb: Math.max(20, Math.min(80, awayProb)) };
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');
    
    try {
        const games = await getNHLSchedule();
        
        if (games.length === 0) {
            return res.status(200).json({
                success: true,
                games: [],
                message: 'No NHL games scheduled today'
            });
        }
        
        const polymarketOdds = await getPolymarketOdds();
        
        const enrichedGames = games.map(game => {
            const probs = calculateWinProb(game.home_team, game.away_team);
            
            let polyOdds = null;
            for (const market of polymarketOdds) {
                if (market.question.includes(game.home_abbr) || 
                    market.question.includes(game.away_abbr)) {
                    const homeToken = market.tokens.find(t => t.outcome?.includes(game.home_abbr));
                    const awayToken = market.tokens.find(t => t.outcome?.includes(game.away_abbr));
                    
                    if (homeToken || awayToken) {
                        polyOdds = {
                            home_prob: homeToken ? parseFloat(homeToken.price) * 100 : null,
                            away_prob: awayToken ? parseFloat(awayToken.price) * 100 : null,
                            volume: market.volume
                        };
                    }
                    break;
                }
            }
            
            let edge = null;
            if (polyOdds && polyOdds.home_prob && polyOdds.away_prob) {
                const homeEdge = probs.homeProb - polyOdds.home_prob;
                const awayEdge = probs.awayProb - polyOdds.away_prob;
                
                if (Math.abs(homeEdge) > 5 || Math.abs(awayEdge) > 5) {
                    const maxEdge = Math.abs(homeEdge) > Math.abs(awayEdge) ? homeEdge : awayEdge;
                    const team = Math.abs(homeEdge) > Math.abs(awayEdge) ? game.home_team : game.away_team;
                    
                    edge = {
                        recommendation: maxEdge > 0 ? `BET ${team}` : `FADE ${team}`,
                        confidence: Math.abs(maxEdge) > 10 ? 'HIGH' : 'MEDIUM',
                        value: maxEdge
                    };
                }
            }
            
            return {
                ...game,
                home_win_prob: probs.homeProb.toFixed(1),
                away_win_prob: probs.awayProb.toFixed(1),
                polymarket_odds: polyOdds,
                edge,
                goalies: {
                    home: { name: 'TBD', gaa: '-', sv_pct: '-', wins: 0, losses: 0 },
                    away: { name: 'TBD', gaa: '-', sv_pct: '-', wins: 0, losses: 0 }
                }
            };
        });
        
        res.status(200).json({
            success: true,
            games: enrichedGames,
            timestamp: new Date().toISOString(),
            sources: {
                nhl_api: true,
                polymarket: polymarketOdds.length > 0
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
```

**Create folder: `api/` then save as: `api/games.js`**

---

## ✅ That's it! All 5 files.

**Your structure should be:**
```
puck-prophet/
├── package.json
├── vercel.json
├── .gitignore
├── public/
│   └── index.html
└── api/
    └── games.js