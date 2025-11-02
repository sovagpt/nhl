#!/usr/bin/env python3
import requests
import json
from datetime import datetime

CDN_BASE = 'https://public-ds.static.dobbersports.com'

def parse_goalie(goalie_data):
    if not goalie_data or not isinstance(goalie_data, list) or len(goalie_data) == 0:
        return None
    
    goalie = goalie_data[0]
    goalie_id = goalie.get('id', '')
    
    return {
        'id': goalie_id,
        'name': goalie.get('firstName', '') + ' ' + goalie.get('lastName', ''),
        'number': 0,
        'confirmed': True,
        'status': 'Confirmed',
        'headshot': f"{CDN_BASE}/player-headshots/{goalie_id}.png",
        'stats': {
            'wins': 0,
            'losses': 0,
            'otl': 0,
            'record': '0-0-0',
            'gaa': 0,
            'savePct': 0,
            'shutouts': 0,
        }
    }

def main():
    try:
        print("Fetching games from weekly schedule...")
        
        headers = {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json'
        }
        
        # Try multiple weeks
        all_games = []
        for week in range(1, 4):
            try:
                response = requests.get(
                    f'https://core.api.dobbersports.com/v1/weekly-schedule/weekly-games?week={week}',
                    headers=headers,
                    timeout=30
                )
                
                if response.status_code == 200:
                    data = response.json()
                    weekly_games = data.get('data', {}).get('content', {}).get('weeklyGames', [])
                    all_games.extend(weekly_games)
                    print(f"Week {week}: Found {len(weekly_games)} games")
            except:
                pass
        
        print(f"Total games found: {len(all_games)}")
        
        games = []
        for game in all_games[:20]:  # Limit to 20 games
            if not isinstance(game, dict):
                continue
            
            try:
                team_info = game.get('team', {})
                opponent_team = game.get('opponentTeam', {})
                
                games.append({
                    'gameId': game.get('gameId', ''),
                    'gameDate': game.get('epochDate', ''),
                    'gameTime': 'TBD',
                    'venue': '',
                    'status': 'Scheduled',
                    'away': {
                        'team': opponent_team.get('name', ''),
                        'teamAbbrev': opponent_team.get('abbreviation', ''),
                        'teamLogo': f"{CDN_BASE}/team-logo/dark/{opponent_team.get('id', '')}.png",
                        'goalie': parse_goalie(game.get('goalies', []))
                    },
                    'home': {
                        'team': team_info.get('name', ''),
                        'teamAbbrev': team_info.get('abbreviation', ''),
                        'teamLogo': f"{CDN_BASE}/team-logo/dark/{team_info.get('id', '')}.png",
                        'goalie': None
                    }
                })
            except Exception as e:
                print(f"Error parsing game: {e}")
                continue
        
        print(f"Parsed {len(games)} games")
        
        data = {
            'timestamp': datetime.utcnow().isoformat(),
            'games': games,
            'bettingEdges': []
        }
        
        with open('data.json', 'w') as f:
            json.dump(data, f, indent=2)
        
        print("✅ Success!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise

if __name__ == '__main__':
    main()
