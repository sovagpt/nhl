#!/usr/bin/env python3
import requests
import json
from datetime import datetime

BASE_API = 'https://core.api.dobbersports.com/v1'
CDN_BASE = 'https://public-ds.static.dobbersports.com'

def parse_goalie(goalie_data):
    if not goalie_data:
        return None
    
    goalie_id = goalie_data.get('id', '')
    
    return {
        'id': goalie_id,
        'name': goalie_data.get('name', 'Unknown'),
        'number': goalie_data.get('number', 0),
        'confirmed': goalie_data.get('confirmed', False),
        'status': goalie_data.get('status', ''),
        'headshot': f"{CDN_BASE}/player-headshots/{goalie_id}.png",
        'stats': {
            'wins': goalie_data.get('wins', 0),
            'losses': goalie_data.get('losses', 0),
            'otl': goalie_data.get('otl', 0),
            'record': f"{goalie_data.get('wins', 0)}-{goalie_data.get('losses', 0)}-{goalie_data.get('otl', 0)}",
            'gaa': goalie_data.get('gaa', 0),
            'savePct': goalie_data.get('savePct', 0),
            'shutouts': goalie_data.get('shutouts', 0),
        }
    }

def calculate_betting_edges(games):
    edges = []
    
    for game in games:
        away_goalie = game.get('away', {}).get('goalie')
        home_goalie = game.get('home', {}).get('goalie')
        
        if not away_goalie or not home_goalie:
            continue
        
        away_sv = away_goalie.get('stats', {}).get('savePct', 0)
        home_sv = home_goalie.get('stats', {}).get('savePct', 0)
        
        if away_sv > 0.920 and home_sv < 0.900:
            edges.append({
                'game': f"{game['away']['teamAbbrev']} @ {game['home']['teamAbbrev']}",
                'betType': 'AWAY ML',
                'edge': 'HIGH',
                'reason': f"Elite away goalie ({away_goalie['name']}: {away_sv:.3f} SV%) vs weak home goalie ({home_goalie['name']}: {home_sv:.3f} SV%)",
                'confidence': 8
            })
        
        total_sv_avg = (away_sv + home_sv) / 2
        if total_sv_avg > 0.925:
            edges.append({
                'game': f"{game['away']['teamAbbrev']} @ {game['home']['teamAbbrev']}",
                'betType': 'UNDER',
                'edge': 'MEDIUM',
                'reason': f"Two elite goalies (avg SV%: {total_sv_avg:.3f})",
                'confidence': 7
            })
        elif total_sv_avg < 0.890:
            edges.append({
                'game': f"{game['away']['teamAbbrev']} @ {game['home']['teamAbbrev']}",
                'betType': 'OVER',
                'edge': 'MEDIUM',
                'reason': f"Two weak goalies (avg SV%: {total_sv_avg:.3f})",
                'confidence': 7
            })
    
    edges.sort(key=lambda x: x['confidence'], reverse=True)
    return edges

def main():
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
        }
        
        print("Fetching data...")
        response = requests.get(f"{BASE_API}/feed/goalie-post-feed", headers=headers, timeout=30)
        response.raise_for_status()
        
        api_data = response.json()
        print(f"Found {len(api_data)} games")
        
        games = []
        for game in api_data:
            games.append({
                'gameId': game.get('id', ''),
                'gameDate': game.get('gameDate', ''),
                'gameTime': game.get('gameTime', ''),
                'venue': game.get('venue', ''),
                'status': game.get('status', ''),
                'away': {
                    'team': game.get('awayTeam', {}).get('name', ''),
                    'teamAbbrev': game.get('awayTeam', {}).get('abbreviation', ''),
                    'teamLogo': f"{CDN_BASE}/team-logo/dark/{game.get('awayTeam', {}).get('id', '')}.png",
                    'goalie': parse_goalie(game.get('awayGoalie'))
                },
                'home': {
                    'team': game.get('homeTeam', {}).get('name', ''),
                    'teamAbbrev': game.get('homeTeam', {}).get('abbreviation', ''),
                    'teamLogo': f"{CDN_BASE}/team-logo/dark/{game.get('homeTeam', {}).get('id', '')}.png",
                    'goalie': parse_goalie(game.get('homeGoalie'))
                }
            })
        
        betting_edges = calculate_betting_edges(games)
        print(f"Found {len(betting_edges)} betting edges")
        
        data = {
            'timestamp': datetime.utcnow().isoformat(),
            'games': games,
            'bettingEdges': betting_edges
        }
        
        with open('data.json', 'w') as f:
            json.dump(data, f, indent=2)
        
        print("✅ Success!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        raise

if __name__ == '__main__':
    main()
