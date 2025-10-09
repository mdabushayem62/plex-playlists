/**
 * Manual artist-to-genre mapping
 * Used as fallback when tracks don't have embedded genre tags
 */

export const ARTIST_GENRE_MAP: Record<string, string[]> = {
  // Synthwave
  'F.O.O.L': ['synthwave', 'electronic'],
  'Daniel Deluxe': ['synthwave', 'darksynth'],
  'Perturbator': ['synthwave', 'darksynth'],
  'Carpenter Brut': ['synthwave', 'darksynth'],
  'Waveshaper': ['synthwave'],
  'The Midnight': ['synthwave'],
  'Timecop1983': ['synthwave'],
  'Mitch Murder': ['synthwave'],
  'Scandroid': ['synthwave'],
  'W O L F C L U B': ['synthwave'],
  'Com Truise': ['synthwave', 'electronic'],
  'Cassetter': ['synthwave'],
  'PYLOT': ['synthwave'],
  'A.L.I.S.O.N': ['synthwave'],
  'Volkor X': ['synthwave'],
  'The Toxic Avenger': ['synthwave', 'electronic'],
  'Ace Buchannon': ['synthwave'],
  'Earmake': ['synthwave'],
  'Mental Minority': ['synthwave'],
  'Void Chapter': ['synthwave'],
  'Synthetic Epiphany': ['synthwave'],
  'Alpha Room': ['synthwave'],
  'Krosia': ['synthwave'],
  'Zane Alexander': ['synthwave'],
  'Kotovsky86': ['synthwave'],
  'LukHash': ['synthwave', 'electronic'],
  'Rosentwig': ['synthwave'],
  'Windows96': ['synthwave'],
  'Ephixa': ['synthwave', 'electronic'],
  'OVERWERK': ['synthwave', 'electronic'],
  'PrototypeRaptor': ['synthwave'],
  'skeler.': ['synthwave'],
  'Cloud Battalion': ['synthwave'],
  'Stilz': ['synthwave'],

  // Psytrance
  'Astral Projection': ['psytrance', 'trance'],
  'Infected Mushroom': ['psytrance', 'electronic'],
  'Liquid Soul': ['psytrance'],
  'E-Clip': ['psytrance', 'electronic'],
  'Blastoyz': ['psytrance'],
  'Neelix': ['psytrance'],
  'Audiomatic': ['psytrance', 'electronic'],
  'Sub Morphine': ['psytrance'],
  'Berg': ['psytrance'],
  'Arkana': ['psytrance'],
  'Processor': ['psytrance'],

  // Trance
  'Armin van Buuren': ['trance', 'electronic'],
  'Above & Beyond': ['trance', 'electronic'],
  'Markus Schulz': ['trance'],
  'Gareth Emery': ['trance'],
  'Jason Ross': ['trance'],
  'Super8 & Tab': ['trance'],
  'Mat Zo': ['trance', 'electronic'],
  'BT': ['trance', 'electronic'],
  'Three Drives': ['trance'],

  // Dubstep
  'Flux Pavilion': ['dubstep', 'electronic'],
  'NGHTMRE': ['dubstep', 'electronic'],
  'Memtrix': ['dubstep', 'drum and bass'],
  'MUZZ': ['dubstep', 'drum and bass'],
  'Stonebank': ['dubstep', 'electronic'],

  // Drum & Bass
  'Feint': ['drum and bass', 'electronic'],
  'Koven': ['drum and bass', 'electronic'],
  'Netsky': ['drum and bass'],

  // Electronic / House / Techno
  'deadmau5': ['electronic', 'house'],
  'Daft Punk': ['electronic', 'house'],
  'Calvin Harris': ['electronic', 'house'],
  'Martin Garrix': ['electronic', 'house'],
  'Afrojack': ['electronic', 'house'],
  'Tiësto': ['electronic', 'trance'],
  'David Guetta': ['electronic', 'house'],
  'Diplo': ['electronic'],
  'DJ Snake': ['electronic'],
  'Steve Aoki': ['electronic'],
  'Nicky Romero': ['electronic', 'house'],
  'W&W': ['electronic', 'trance'],
  'Hardwell': ['electronic', 'house'],
  'R3HAB': ['electronic', 'house'],
  'CamelPhat': ['electronic', 'house'],
  'Chris Lake': ['electronic', 'house'],
  'Eric Prydz': ['electronic', 'house'],
  'Sander van Doorn': ['electronic', 'trance'],
  'NERVO': ['electronic', 'house'],
  'ARTBAT': ['electronic', 'techno'],
  'Anyma': ['electronic', 'techno'],
  'MEDUZA': ['electronic', 'house'],
  'Nora en Pure': ['electronic', 'house'],
  'Justice': ['electronic'],
  'Röyksopp': ['electronic'],
  'DVBBS': ['electronic', 'house'],
  'Timmy Trumpet': ['electronic', 'house'],
  'Dada Life': ['electronic', 'house'],
  'Audien': ['electronic', 'trance'],
  'Alison Wonderland': ['electronic'],
  'Mord Fustang': ['electronic'],
  'Notaker': ['electronic'],
  'Rootkit': ['electronic'],
  'Dot': ['electronic'],
  'phonon': ['electronic'],
  'Heimanu': ['electronic'],
  'Pierce Fulton': ['electronic', 'house'],
  'The Glitch Mob': ['electronic'],
  'Cerrone': ['electronic', 'disco'],

  // Ambient / Downtempo
  'Rival Consoles': ['electronic', 'ambient'],
  'Gustavo Santaolalla': ['ambient', 'soundtrack'],
  'Janus Rasmussen': ['ambient', 'electronic'],
  'Kara‐Lis Coverdale': ['electronic', 'experimental'],
  'delay_ok': ['electronic', 'jazz'],
  'GoGo Penguin': ['jazz', 'electronic'],
  'Anatole Muster': ['electronic', 'ambient'],

  // Metal / Rock
  'Amon Amarth': ['power-metal', 'death metal'],
  'Behemoth': ['death metal', 'black metal'],
  'Heaven Shall Burn': ['metalcore'],
  'Godsmack': ['rock', 'metal'],
  'Volbeat': ['rock', 'metal'],
  'In Flames': ['melodic death metal'],
  'Wage War': ['metalcore'],
  'Fit for a King': ['metalcore'],
  'Beartooth': ['metalcore'],
  'Atreyu': ['metalcore'],
  'The Amity Affliction': ['metalcore'],
  'I Prevail': ['metalcore'],
  'Imminence': ['metalcore'],
  'Acres': ['metalcore'],
  'Sleep Theory': ['rock', 'metal'],
  'Calva Louise': ['rock'],
  'BABYMETAL': ['power-metal', 'j-pop'],

  // Synthwave-adjacent electronic
  'Crywolf': ['electronic'],
  'The Anix': ['electronic'],
  'Varien': ['electronic'],
  'ALEX': ['electronic'],
  'Lyde': ['electronic'],
  'Emil Rottmayer': ['electronic'],
  'DVRST': ['electronic'],
  'MALO': ['electronic'],
  'Kareem Ali': ['electronic'],
  'Unseen Dimensions': ['electronic'],
  'Kiile': ['electronic'],
  'KTrek': ['electronic'],
  'Adieu Aru': ['electronic'],
  'FLOCKS': ['electronic'],
  'Balduin': ['electro swing'],
  'Lime': ['electronic'],

  // Game/Film Composers
  'Hans Zimmer': ['soundtrack', 'orchestral'],
  'John Williams': ['soundtrack', 'orchestral'],
  'James Horner': ['soundtrack', 'orchestral'],
  'Michael Giacchino': ['soundtrack', 'orchestral'],
  'Tyler Bates': ['soundtrack'],
  'Nobuo Uematsu': ['soundtrack', 'game music'],
  'Jesper Kyd': ['soundtrack', 'game music'],
  'Riot Games Music Team': ['soundtrack', 'game music'],
  'ATLUS Sound Team': ['soundtrack', 'game music'],
  'Capcom Sound Team': ['soundtrack', 'game music'],
  'OGRE Sound': ['soundtrack', 'game music'],
  'Guillaume Ferran': ['soundtrack', 'game music'],
  'Atanas Valkov': ['soundtrack', 'game music'],
  'Wojciech Golczewski': ['soundtrack', 'electronic'],
  'Christopher Tin': ['soundtrack', 'orchestral'],
  'Danny Elfman': ['soundtrack', 'orchestral'],
  'Sting': ['rock', 'pop']
};

/**
 * Get genres for an artist name (case-insensitive)
 */
export const getGenresForArtist = (artistName: string): string[] => {
  const normalized = artistName.toLowerCase();

  // Try exact match first
  for (const [artist, genres] of Object.entries(ARTIST_GENRE_MAP)) {
    if (artist.toLowerCase() === normalized) {
      return genres;
    }
  }

  // Try partial match
  for (const [artist, genres] of Object.entries(ARTIST_GENRE_MAP)) {
    if (normalized.includes(artist.toLowerCase()) || artist.toLowerCase().includes(normalized)) {
      return genres;
    }
  }

  return [];
};

/**
 * Check if an artist matches a genre filter (case-insensitive substring match)
 */
export const artistMatchesGenre = (artistName: string, genreFilter: string): boolean => {
  const genres = getGenresForArtist(artistName);
  const filterLower = genreFilter.toLowerCase();

  return genres.some(genre => genre.toLowerCase().includes(filterLower));
};
