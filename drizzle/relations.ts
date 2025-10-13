import { relations } from "drizzle-orm/relations";
import { playlists, playlistTracks } from "./schema";

export const playlistTracksRelations = relations(playlistTracks, ({one}) => ({
	playlist: one(playlists, {
		fields: [playlistTracks.playlistId],
		references: [playlists.id]
	}),
}));

export const playlistsRelations = relations(playlists, ({many}) => ({
	playlistTracks: many(playlistTracks),
}));