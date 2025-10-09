# Spotify API Setup (Optional)

Spotify provides genre data and popularity scores for music artists. Getting credentials is **free** and takes about 3 minutes.

## Why Use Spotify?

- **Best for Mainstream Artists**: Better genre coverage than Last.fm for popular music
- **Popularity Scores**: Artist popularity (0-100) for future ranking features
- **Fast**: ~100-200ms per artist lookup
- **Free**: Client credentials flow, no user authentication needed
- **Generous Limits**: 100 requests/second

## When to Use Spotify + Last.fm Together

**Recommended: Use Both!**

The app tries **Spotify first**, then falls back to Last.fm:
- ✅ **Spotify**: Best for mainstream/popular artists (EDM, pop, rock)
- ✅ **Last.fm**: Better for indie/underground/electronic (synthwave, psytrance)
- ✅ **Combined**: Maximum genre coverage

## How to Get Spotify Credentials

### 1. Create Spotify Account
- If you don't have one: https://www.spotify.com/signup
- Free account is fine (no Premium needed)

### 2. Go to Spotify Developer Dashboard
- Visit: https://developer.spotify.com/dashboard
- Log in with your Spotify account

### 3. Create an App
- Click **"Create app"**
- Fill in the form:
  - **App name**: `Plex Playlist Enhancer` (or any name)
  - **App description**: `Automated playlist generation for Plex Media Server`
  - **Redirect URI**: `http://localhost` (required but not used)
  - **APIs used**: Check "Web API"
- Accept terms and click **"Save"**

### 4. Get Credentials
- Click on your newly created app
- Click **"Settings"** (top right)
- You'll see:
  - **Client ID**: A long string (visible)
  - **Client secret**: Click "View client secret" to reveal

### 5. Add to .env File
```bash
# Add these lines to your .env file
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

### 6. Restart Application
```bash
npm run start
```

## Testing Spotify Integration

Test that Spotify is working correctly:

```bash
# Test Spotify only
npx tsx test-spotify.ts

# Test full metadata stack (Spotify + Last.fm + Manual)
npx tsx test-metadata.ts
```

You should see genre data, popularity scores, and follower counts for various artists.

## Without Spotify Credentials

If you don't configure Spotify, the application will:
1. Skip Spotify and go directly to Last.fm
2. Fall back to manual mapping if Last.fm has no data

**Recommendation**: Configure both Spotify AND Last.fm for maximum coverage!

## Rate Limits

Spotify API is very generous for client credentials flow:
- **100 requests per second**
- **No daily limit**
- Tokens auto-refresh (1-hour expiry)
- Typical usage: 200-500 requests for initial playlist generation
- Subsequent runs use cache (30-day TTL)

## Privacy

- Spotify only receives artist names for search
- No user authentication or account linking
- No access to your listening history
- All metadata is cached locally in SQLite

## Troubleshooting

**401 Unauthorized errors?**
- Double-check your Client ID and Secret are correct
- Ensure no extra spaces in `.env` file
- Make sure you copied the full secret (it's long!)
- Try creating a new app in the dashboard

**403 Forbidden errors?**
- Your app might be in "Development Mode" (that's fine)
- Client credentials flow doesn't require approval

**Empty genre arrays?**
- Some artists don't have genres on Spotify
- System will fall back to Last.fm automatically
- If both fail, manual mapping is used

**Token refresh issues?**
- Tokens auto-refresh every hour
- No action needed on your part
- Check logs for "spotify auth failed" errors

## Comparison: Spotify vs Last.fm

| Feature | Spotify | Last.fm |
|---------|---------|---------|
| **Setup** | Client ID + Secret | API Key |
| **Auth** | OAuth tokens | Simple key |
| **Mainstream** | ★★★★★ | ★★★☆☆ |
| **Indie/Underground** | ★★★☆☆ | ★★★★★ |
| **Electronic/Dance** | ★★★★☆ | ★★★★★ |
| **Popularity Scores** | ✅ Yes | ❌ No |
| **Speed** | ~100ms | ~200ms |
| **Rate Limits** | 100/sec | Unlimited |

**Verdict**: Use both for best results! 🎯
