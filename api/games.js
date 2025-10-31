module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    
    try {
        // Simple test response
        const testGames = [
            {
                id: 1,
                home_team: "Boston Bruins",
                away_team: "Buffalo Sabres",
                home_abbr: "BOS",
                away_abbr: "BUF",
                game_time: "7:00 PM",
                status: "scheduled",
                score: null,
                home_win_prob: "55.0",
                away_win_prob: "45.0",
                polymarket_odds: null,
                edge: {
                    recommendation: "BET Boston Bruins",
                    confidence: "MEDIUM",
                    value: 8.5
                },
                goalies: {
                    home: { name: "Linus Ullmark", gaa: "2.50", sv_pct: ".920", wins: 5, losses: 2 },
                    away: { name: "Ukko-Pekka Luukkonen", gaa: "3.10", sv_pct: ".895", wins: 3, losses: 4 }
                }
            }
        ];
        
        res.status(200).json({
            success: true,
            games: testGames,
            timestamp: new Date().toISOString(),
            sources: {
                nhl_api: true,
                polymarket: false
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            games: []
        });
    }
};
