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

function parseTime(timeStr) {
    // Convert times like "7:00 PM ET" to display format
    return timeStr.replace(' ET', '').trim();
}

async function scrapeDailyFaceoff() {
    try {
        const html = await fetch('https://www.dailyfaceoff.com/starting-goalies/');
        const text = html.toString();
        
        const games = [];
        
        // Find all game cards - they're in a structured format
        // Look for patterns like "Team @ Team" and extract everything
        
        // Split by major sections
        const lines = text.split('\n');
        
        let currentGame = null;
        let currentTeam = 'away'; // Start with away team
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Look for game matchup (e.g., "Buffalo @ Boston")
            const matchupMatch = line.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*@\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
            
            if (matchupMatch) {
                // Save previous game if exists
                if (currentGame && currentGame.away_team && currentGame.home_team) {
                    games.push(currentGame);
                }
                
                // Start new game
                currentGame = {
                    away_team: matchupMatch[1].trim(),
                    home_team: matchupMatch[2].trim(),
                    game_time: null,
                    status: 'scheduled',
                    score: null,
                    home_win_prob: "50.0",
                    away_win_prob: "50.0",
                    goalies: {
                        away: { name: "TBD", gaa: "-", sv_pct: "-", wins: 0, losses: 0, otl: 0, confirmed: false, photo: null },
                        home: { name: "TBD", gaa: "-", sv_pct: "-", wins: 0, losses: 0, otl: 0, confirmed: false, photo: null }
                    },
                    edge: null
                };
                currentTeam = 'away';
                continue;
            }
            
            if (!currentGame) continue;
            
            // Look for time (e.g., "7:00 PM ET")
            const timeMatch = line.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)\s*ET)/i);
            if (timeMatch && !currentGame.game_time) {
                currentGame.game_time = parseTime(timeMatch[1]);
            }
            
            // Look for goalie names - usually in bold or heading tags
            const nameMatch = line.match(/>([A-Z][a-z]+\s+[A-Z][a-z]+)</);
            if (nameMatch) {
                const name = nameMatch[1];
                // If we have a name and no goalie set yet for current team
                if (currentTeam === 'away' && currentGame.goalies.away.name === "TBD") {
                    currentGame.goalies.away.name = name;
                } else if (currentTeam === 'home' && currentGame.goalies.home.name === "TBD") {
                    currentGame.goalies.home.name = name;
                    currentTeam = 'away'; // Reset for next game
                } else if (currentGame.goalies.away.name !== "TBD" && currentTeam === 'away') {
                    currentTeam = 'home'; // Switch to home team
                }
            }
            
            // Look for "CONFIRMED" status
            if (line.includes('CONFIRMED') || line.includes('Confirmed')) {
                if (currentTeam === 'away' || currentGame.goalies.home.name === "TBD") {
                    currentGame.goalies.away.confirmed = true;
                } else {
                    currentGame.goalies.home.confirmed = true;
                }
            }
            
            // Look for GAA
            const gaaMatch = line.match(/(\d+\.\d+)\s*GAA/i);
            if (gaaMatch) {
                const gaa = gaaMatch[1];
                if (currentTeam === 'away' && currentGame.goalies.away.gaa === "-") {
                    currentGame.goalies.away.gaa = gaa;
                } else if (currentGame.goalies.home.gaa === "-") {
                    currentGame.goalies.home.gaa = gaa;
                }
            }
            
            // Look for SV%
            const svMatch = line.match(/(\d+\.\d+)\s*SV%/i);
            if (svMatch) {
                const sv = '.' + svMatch[1].replace('.', '');
                if (currentTeam === 'away' && currentGame.goalies.away.sv_pct === "-") {
                    currentGame.goalies.away.sv_pct = sv;
                } else if (currentGame.goalies.home.sv_pct === "-") {
                    currentGame.goalies.home.sv_pct = sv;
                }
            }
            
            // Look for record (W-L-OTL)
            const recordMatch = line.match(/(\d+)-(\d+)-(\d+)/);
            if (recordMatch) {
                const [_, w, l, otl] = recordMatch;
                if (currentTeam === 'away' && currentGame.goalies.away.wins === 0) {
                    currentGame.goalies.away.wins = parseInt(w);
                    currentGame.goalies.away.losses = parseInt(l);
                    currentGame.goalies.away.otl = parseInt(otl);
                } else if (currentGame.goalies.home.wins === 0) {
                    currentGame.goalies.home.wins = parseInt(w);
                    currentGame.goalies.home.losses = parseInt(l);
                    currentGame.goalies.home.otl = parseInt(otl);
                }
            }
        }
        
        // Add last game
        if (currentGame && currentGame.away_team && currentGame.home_team) {
            games.push(currentGame);
        }
        
        return games;
        
    } catch (error) {
        console.error('DailyFaceoff scraping error:', error);
        return [];
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    
    try {
        const games = await scrapeDailyFaceoff();
        
        // Add some edge calculations
        const enrichedGames = games.map(game => {
            // Simple edge calculation based on goalie stats
            let edge = null;
            
            if (game.goalies.home.gaa !== "-" && game.goalies.away.gaa !== "-") {
                const homeGAA = parseFloat(game.goalies.home.gaa);
                const awayGAA = parseFloat(game.goalies.away.gaa);
                
                const gaaDiff = awayGAA - homeGAA;
                
                if (Math.abs(gaaDiff) > 0.5) {
                    const betterTeam = gaaDiff > 0 ? game.home_team : game.away_team;
                    edge = {
                        recommendation: `BET ${betterTeam}`,
                        confidence: Math.abs(gaaDiff) > 1.0 ? "HIGH" : "MEDIUM",
                        value: Math.abs(gaaDiff * 10).toFixed(1)
                    };
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
            timestamp: new Date().toISOString(),
            sources: {
                dailyfaceoff: true,
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
