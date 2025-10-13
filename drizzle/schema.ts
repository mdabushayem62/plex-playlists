import { sqliteTable, AnySQLiteColumn, integer, text, foreignKey, real, uniqueIndex, index } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const jobRuns = sqliteTable("job_runs", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	window: text().notNull(),
	startedAt: integer("started_at").notNull(),
	finishedAt: integer("finished_at"),
	status: text().notNull(),
	error: text(),
	progressCurrent: integer("progress_current").default(0),
	progressTotal: integer("progress_total").default(0),
	progressMessage: text("progress_message"),
});

export const playlistTracks = sqliteTable("playlist_tracks", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	playlistId: integer("playlist_id").notNull().references(() => playlists.id, { onDelete: "cascade" } ),
	plexRatingKey: text("plex_rating_key").notNull(),
	title: text(),
	artist: text(),
	album: text(),
	position: integer().notNull(),
	score: real(),
	genres: text(),
	recencyWeight: real("recency_weight"),
	fallbackScore: real("fallback_score"),
});

export const playlists = sqliteTable("playlists", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	window: text().notNull(),
	plexRatingKey: text("plex_rating_key"),
	title: text(),
	description: text(),
	generatedAt: integer("generated_at").notNull(),
	trackCount: integer("track_count").default(0).notNull(),
},
(table) => {
	return {
		windowUnique: uniqueIndex("playlists_window_unique").on(table.window),
	}
});

export const artistCache = sqliteTable("artist_cache", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	artistName: text("artist_name").notNull(),
	genres: text().notNull(),
	source: text().notNull(),
	cachedAt: integer("cached_at").default(sql`(strftime('%s','now')*1000)`).notNull(),
	expiresAt: integer("expires_at"),
	moods: text().default("[]").notNull(),
	lastUsedAt: integer("last_used_at"),
	spotifyArtistId: text("spotify_artist_id"),
	popularity: integer(),
},
(table) => {
	return {
		artistUnique: uniqueIndex("artist_cache_artist_unique").on(table.artistName),
		spotifyIdIdx: index("artist_cache_spotify_id_idx").on(table.spotifyArtistId),
	}
});

export const setupState = sqliteTable("setup_state", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	currentStep: text("current_step").notNull(),
	completed: integer().default(false).notNull(),
	stepData: text("step_data"),
	createdAt: integer("created_at").default(sql`(strftime('%s','now')*1000)`).notNull(),
	updatedAt: integer("updated_at").default(sql`(strftime('%s','now')*1000)`).notNull(),
});

export const settings = sqliteTable("settings", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	key: text().notNull(),
	value: text(),
	updatedAt: integer("updated_at").default(sql`(strftime('%s','now')*1000)`).notNull(),
},
(table) => {
	return {
		keyUnique: uniqueIndex("settings_key_unique").on(table.key),
	}
});

export const settingsHistory = sqliteTable("settings_history", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	settingKey: text("setting_key").notNull(),
	oldValue: text("old_value"),
	newValue: text("new_value").notNull(),
	changedBy: text("changed_by").default("web_ui").notNull(),
	changedAt: integer("changed_at").default(sql`(strftime('%s','now')*1000)`).notNull(),
},
(table) => {
	return {
		changedAtIdx: uniqueIndex("settings_history_changed_at_idx").on(table.changedAt),
		keyIdx: uniqueIndex("settings_history_key_idx").on(table.settingKey),
	}
});

export const albumCache = sqliteTable("album_cache", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	artistName: text("artist_name").notNull(),
	albumName: text("album_name").notNull(),
	genres: text().notNull(),
	source: text().notNull(),
	cachedAt: integer("cached_at").default(sql`(strftime('%s','now')*1000)`).notNull(),
	expiresAt: integer("expires_at"),
	moods: text().default("[]").notNull(),
	lastUsedAt: integer("last_used_at"),
},
(table) => {
	return {
		albumUnique: uniqueIndex("album_cache_album_unique").on(table.artistName, table.albumName),
	}
});

export const customPlaylists = sqliteTable("custom_playlists", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	name: text().notNull(),
	genres: text().default("[]").notNull(),
	moods: text().default("[]").notNull(),
	enabled: integer().default(true).notNull(),
	cron: text(),
	targetSize: integer("target_size").default(50),
	description: text(),
	createdAt: integer("created_at").default(sql`(strftime('%s','now')*1000)`).notNull(),
	updatedAt: integer("updated_at").default(sql`(strftime('%s','now')*1000)`).notNull(),
	scoringStrategy: text("scoring_strategy").default("quality").notNull(),
},
(table) => {
	return {
		nameUnique: uniqueIndex("custom_playlists_name_unique").on(table.name),
	}
});

export const trackCache = sqliteTable("track_cache", {
	ratingKey: text("rating_key").primaryKey().notNull(),
	title: text().notNull(),
	artistName: text("artist_name").notNull(),
	albumName: text("album_name"),
	duration: integer(),
	year: integer(),
	trackIndex: integer("track_index"),
	parentRatingKey: text("parent_rating_key"),
	grandparentRatingKey: text("grandparent_rating_key"),
	genres: text().default("[]").notNull(),
	moods: text().default("[]").notNull(),
	staticCachedAt: integer("static_cached_at").notNull(),
	staticExpiresAt: integer("static_expires_at").notNull(),
	userRating: real("user_rating"),
	viewCount: integer("view_count").default(0),
	skipCount: integer("skip_count").default(0),
	lastViewedAt: integer("last_viewed_at"),
	statsCachedAt: integer("stats_cached_at").notNull(),
	statsExpiresAt: integer("stats_expires_at").notNull(),
	qualityScore: real("quality_score"),
	isHighRated: integer("is_high_rated"),
	isUnplayed: integer("is_unplayed"),
	isUnrated: integer("is_unrated"),
	lastUsedAt: integer("last_used_at"),
	isrc: text(),
},
(table) => {
	return {
		statsExpiresIdx: index("track_cache_stats_expires_idx").on(table.statsExpiresAt),
		staticExpiresIdx: index("track_cache_static_expires_idx").on(table.staticExpiresAt),
		unplayedIdx: index("track_cache_unplayed_idx").on(table.isUnplayed),
		highRatedIdx: index("track_cache_high_rated_idx").on(table.isHighRated),
		lastViewedIdx: index("track_cache_last_viewed_idx").on(table.lastViewedAt),
		qualityIdx: index("track_cache_quality_idx").on(table.qualityScore),
		ratingIdx: index("track_cache_rating_idx").on(table.userRating),
		albumIdx: index("track_cache_album_idx").on(table.albumName),
		artistIdx: index("track_cache_artist_idx").on(table.artistName),
	}
});

export const drizzleMigrations = sqliteTable("__drizzle_migrations", {
});

