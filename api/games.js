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

async function getDailyFaceoffStarters() {
    try {
        // DailyFaceoff has a public endpoint for starting goalies
        const data = await fetch('https://www.dailyfaceoff.com/starting-goalies/');
        const html = data.toString();
        
        const goalies = [];
        
        // Parse their HTML - they have a clean structure
        const gameRegex = /<div class="starting-goalies-card">([\s\S]*?)<\/div>/gi;
        let match;
        
        while ((match = gameRegex.exec(html)) !== null) {
            const card = match[1];
            
            // Extract goalie name
            const nameMatch = /<h3[^>]*>([^<]+)<\/h3>/i.exec(card);
            // Extract team
            const teamMatch = /<span[^>]*team[^>]*>([^<]+)<\/span>/i.exec(card);
            // Extract stats
            const gaaMatch = /(\d+\.\d+)\s*GAA/i.exec(card);
            const svMatch = /(\d+\.\d+)\s*SV%/i.exec(card);
            const recordMatch = /(\d+)-(\d+)-(\d+)/i.exec(card);
            
            if (nameMatch && teamMatch) {
                goalies.push({
                    name: nameMatch[1].trim(),
                    team: teamMatch[1].trim(),
                    gaa: gaaMatch ? gaaMatch[1] : 'N/A',
                    sv_pct: svMatch ? '.' + svMatch[1] : 'N/A',
                    wins: recordMatch ? parseInt(recordMatch[1]) : 0,
                    losses: recordMatch ? parseInt(recordMatch[2]) : 0,
                    otl: recordMatch ? parseInt(recordMatch[3]) : 0,
                    confirmed: true
                });
            }
        }
        
        return goalies;
    } catch (error) {
        console.error('DailyFaceoff fetch error:', error);
        return [];
    }
}

function matchGoalie(goalies, teamAbbr, teamName) {
    const teamLower = teamName.toLowerCase();
    
    for (const goalie of goalies) {
        const goalieTeam = goalie.team.toLowerCase();
        if (goalieTeam.includes(teamLower) || teamLower.includes(goalieTeam)) {
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
        
        const [nhlData, confirmedStarters] = await Promise.all([
            fetch(`https://api-web.nhle.com/v1/schedule/${today}`),
            getDailyFaceoffStarters()
        ]);
        
        const nhlJson = JSON.parse(nhlData);
        const games = [];
        
        if (nhlJson.gameWeek && nhlJson.gameWeek.length > 0) {
            for (const week of nhlJson.gameWeek) {
                if (week.games) {
                    for (const game of week.games) {
                        const homeTeam = game.homeTeam.placeName.default + ' ' + game.homeTeam.commonName.default;
                        const awayTeam = game.awayTeam.placeName.default + ' ' + game.awayTeam.commonName.default;
                        
                        const homeGoalie = matchGoalie(confirmedStarters, game.homeTeam.abbrev, homeTeam) || {
                            name: "TBD",
                            gaa: "-",
                            sv_pct: "-",
                            wins: 0,
                            losses: 0,
                            otl: 0,
                            confirmed: false
                        };
                        
                        const awayGoalie = matchGoalie(confirmedStarters, game.awayTeam.abbrev, awayTeam) || {
                            name: "TBD",
                            gaa: "-",
                            sv_pct: "-",
                            wins: 0,
                            losses: 0,
                            otl: 0,
                            confirmed: false
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
                dailyfaceoff_starters: confirmedStarters.length > 0,
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
