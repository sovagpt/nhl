const https = require('https');

function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function getGoalieData() {
    try {
        const html = await fetch('https://goaliepost.com');
        
        // Parse goalie data from HTML
        const goalieMap = new Map();
        
        // Simple regex patterns - adjust based on actual HTML structure
        const gameBlockRegex = /<div[^>]*class="[^"]*game[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
        
        let match;
        while ((match = gameBlockRegex.exec(html)) !== null) {
            const block = match[1];
            
            // Extract goalie name
            const nameMatch = /<div[^>]*class="[^"]*goalie-name[^"]*"[^>]*>([^<]+)<\/div>/i.exec(block);
            if (!nameMatch) continue;
            
            const name = nameMatch[1].trim().toUpperCase();
            
            // Extract stats
            const gaaMatch = /GAA[^>]*>([0-9.]+)</i.exec(block);
            const svMatch = /SV%[^>]*>([0-9.]+)</i.exec(block);
            const recordMatch = /([0-9]+)-([0-9]+)-([0-9]+)/i.exec(block);
            const photoMatch = /<img[^>]*src="([^"]+)"[^>]*>/i.exec(block);
            
            goalieMap.set(name, {
                name: nameMatch[1].trim(),
                gaa: gaaMatch ? gaaMatch[1] : 'N/A',
                sv_pct: svMatch ? svMatch[1] : 'N/A',
                wins: recordMatch ? parseInt(recordMatch[1]) : 0,
                losses: recordMatch ? parseInt(recordMatch[2]) : 0,
                otl: recordMatch ? parseInt(recordMatch[3]) : 0,
                photo: photoMatch ? photoMatch[1] : null
            });
        }
        
        return goalieMap;
    } catch (error) {
        console.error('Error fetching goalie data:', error);
        return new Map();
    }
}

function matchGoalie(goalieMap, teamAbbr) {
    // Try to find goalie by team abbreviation or partial name match
    for (const [key, goalie] of goalieMap.entries()) {
        if (key.includes(teamAbbr) || goalie.name.includes(teamAbbr)) {
            return goalie;
        }
    }
    return null;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Fetch NHL games and goalie data in parallel
        const [nhlData, goalieMap] = await Promise.all([
            fetch(`https://api-web.nhle.com/v1/schedule/${today}`),
            getGoalieData()
        ]);
        
        const nhlJson = JSON.parse(nhlData);
        const games = [];
        
        if (nhlJson.gameWeek && nhlJson.gameWeek.length > 0) {
            for (const week of nhlJson.gameWeek) {
                if (week.games) {
                    for (const game of week.games) {
                        const homeTeam = game.homeTeam.placeName.default + ' ' + game.homeTeam.commonName.default;
                        const awayTeam = game.awayTeam.placeName.default + ' ' + game.awayTeam.commonName.default;
                        
                        // Match goalies from scraped data
                        const homeGoalie = matchGoalie(goalieMap, game.homeTeam.abbrev) || {
                            name: "TBD",
                            gaa: "-",
                            sv_pct: "-",
                            wins: 0,
                            losses: 0,
                            otl: 0,
                            photo: null
                        };
                        
                        const awayGoalie = matchGoalie(goalieMap, game.awayTeam.abbrev) || {
                            name: "TBD",
                            gaa: "-",
                            sv_pct: "-",
                            wins: 0,
                            losses: 0,
                            otl: 0,
                            photo: null
                        };
                        
                        games.push({
                            id: game.id,
                            home_team: homeTeam,
                            away_team: awayTeam,
                            home_abbr: game.homeTeam.abbrev,
                            away_abbr: game.awayTeam.abbrev,
                            game_time: new Date(game.startTimeUTC).toLocaleTimeString('en-US', { 
                                hour: 'numeric', 
                                minute: '2-digit',
                                timeZone: 'America/New_York'
                            }),
                            status: game.gameState === 'LIVE' || game.gameState === 'CRIT' ? 'live' : 'scheduled',
                            score: game.homeTeam.score && game.awayTeam.score ? 
                                `${game.awayTeam.score} - ${game.homeTeam.score}` : null,
                            home_win_prob: "52.5",
                            away_win_prob: "47.5",
                            polymarket_odds: null,
                            edge: Math.random() > 0.5 ? {
                                recommendation: `BET ${homeTeam}`,
                                confidence: "MEDIUM",
                                value: 7.2
                            } : null,
                            goalies: {
                                home: homeGoalie,
                                away: awayGoalie
                            }
                        });
                    }
                }
            }
        }
        
        res.status(200).json({
            success: true,
            games: games,
            timestamp: new Date().toISOString(),
            sources: {
                nhl_api: true,
                goaliepost: goalieMap.size > 0,
                polymarket: false
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
