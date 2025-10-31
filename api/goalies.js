const https = require('https');

function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            } 
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function parseGoalieData(html) {
    const goalies = [];
    
    // GoaliePost has sections for each game
    // We need to extract: name, team, photo, stats (GAA, SV%, W-L-OTL, etc)
    
    // Match goalie name patterns
    const nameRegex = /<div[^>]*class="[^"]*goalie-name[^"]*"[^>]*>([^<]+)<\/div>/gi;
    const names = [];
    let match;
    while ((match = nameRegex.exec(html)) !== null) {
        names.push(match[1].trim());
    }
    
    // Match GAA (Goals Against Average)
    const gaaRegex = /<span[^>]*>GAA<\/span>\s*<span[^>]*>([0-9.]+)<\/span>/gi;
    const gaas = [];
    while ((match = gaaRegex.exec(html)) !== null) {
        gaas.push(match[1]);
    }
    
    // Match SV% (Save Percentage)
    const svRegex = /<span[^>]*>SV%<\/span>\s*<span[^>]*>([0-9.]+)<\/span>/gi;
    const svs = [];
    while ((match = svRegex.exec(html)) !== null) {
        svs.push(match[1]);
    }
    
    // Match record (W-L-OTL)
    const recordRegex = /<span[^>]*>([0-9]+)-([0-9]+)-([0-9]+)<\/span>/gi;
    const records = [];
    while ((match = recordRegex.exec(html)) !== null) {
        records.push({ w: match[1], l: match[2], otl: match[3] });
    }
    
    // Try to extract goalie photos
    const photoRegex = /<img[^>]*src="([^"]*goalie[^"]*)"[^>]*>/gi;
    const photos = [];
    while ((match = photoRegex.exec(html)) !== null) {
        photos.push(match[1]);
    }
    
    // Combine all data
    for (let i = 0; i < names.length; i++) {
        goalies.push({
            name: names[i] || 'Unknown',
            photo: photos[i] || null,
            stats: {
                gaa: gaas[i] || 'N/A',
                sv_pct: svs[i] || 'N/A',
                wins: records[i]?.w || 0,
                losses: records[i]?.l || 0,
                otl: records[i]?.otl || 0,
                shutouts: 0 // Would need more parsing
            }
        });
    }
    
    return goalies;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    
    try {
        const html = await fetch('https://goaliepost.com');
        const goalies = parseGoalieData(html);
        
        res.status(200).json({
            success: true,
            goalies: goalies,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Goalie scraping error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            goalies: []
        });
    }
};
