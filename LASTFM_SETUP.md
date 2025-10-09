# Last.fm API Setup (Optional)

Last.fm provides genre/tag data for music artists to improve playlist generation. Getting an API key is **free** and takes about 2 minutes.

## Why Use Last.fm?

- **Better Genre Data**: Community-tagged genres with high accuracy
- **Great for Electronic Music**: Excellent coverage of synthwave, psytrance, dubstep, etc.
- **Fast**: ~200ms per artist lookup
- **Free**: Unlimited API calls with generous rate limits
- **No Navidrome Needed**: Direct API access, one less service to run

## How to Get an API Key

1. **Create Last.fm Account** (if you don't have one)
   - Go to https://www.last.fm/join
   - Sign up with email or social login

2. **Request API Key**
   - Visit: https://www.last.fm/api/account/create
   - Fill in the form:
     - **Application name**: `Plex Playlist Enhancer` (or any name)
     - **Application description**: `Automated playlist generation for Plex`
     - **Application homepage**: Leave blank or use your Plex URL
     - **Callback URL**: Leave blank (not needed)
   - Accept terms and submit

3. **Copy API Key**
   - You'll receive an **API Key** (32-character hex string)
   - You DON'T need the "Shared Secret" for this application

4. **Add to .env File**
   ```bash
   # Add this line to your .env file
   LASTFM_API_KEY=your_32_character_api_key_here
   ```

5. **Restart Application**
   ```bash
   npm run start
   ```

## Testing Last.fm Integration

Test that Last.fm is working correctly:

```bash
# Run the test script
npx tsx test-lastfm.ts
```

You should see genre data for various artists like Perturbator, Skrillex, etc.

## Without Last.fm API Key

If you don't configure a Last.fm API key, the application will fall back to:
1. **Manual genre mapping** (`src/genre-mapping.ts`) - covers ~100 artists
2. **No genres** for unknown artists - they won't match genre-based playlists

Genre playlists (synthwave, psytrance, etc.) will have **very limited** track selection without Last.fm.

## Rate Limits

Last.fm API is very generous:
- **No hard limit** on requests per day
- Rate limiting is per-IP and very high
- Typical usage: 200-500 requests for initial playlist generation
- Subsequent runs use cache (30-day TTL)

## Privacy

- Last.fm only receives artist names (no track titles, play counts, or user data)
- All metadata is cached locally in SQLite
- No scrobbling or user account linking

## Troubleshooting

**403 Forbidden errors?**
- Double-check your API key is correct
- Ensure no extra spaces in `.env` file
- Try creating a new API key

**No genres found for artists?**
- Some niche artists may not have tags on Last.fm
- Check the artist name spelling
- Manual mapping in `src/genre-mapping.ts` is a fallback

**Slow performance?**
- First run is always slow (building cache)
- Subsequent runs use cached data
- Consider pre-warming cache with sync command (future feature)
