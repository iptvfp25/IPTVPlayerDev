const SETTINGS_KEY = "iptv-settings";

export type AppLanguage = "en" | "it" | "fr" | "de";
export type AccentColor = "rose" | "blue" | "emerald" | "amber" | "cyan" | "orange";

export interface AppSettings {
  language: AppLanguage;
  accentColor: AccentColor;
}

const defaultSettings: AppSettings = {
  language: "en",
  accentColor: "rose",
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export const ACCENT_COLORS: Record<AccentColor, { primary: string; dark: string; shadow: string; label: string }> = {
  rose:    { primary: "#e91e63", dark: "#d81b60", shadow: "#e91e63", label: "Rose" },
  blue:    { primary: "#2563eb", dark: "#1d4ed8", shadow: "#2563eb", label: "Blue" },
  emerald: { primary: "#059669", dark: "#047857", shadow: "#059669", label: "Emerald" },
  amber:   { primary: "#d97706", dark: "#b45309", shadow: "#d97706", label: "Amber" },
  cyan:    { primary: "#0891b2", dark: "#0e7490", shadow: "#0891b2", label: "Cyan" },
  orange:  { primary: "#ea580c", dark: "#c2410c", shadow: "#ea580c", label: "Orange" },
};

export const LANGUAGES: Record<AppLanguage, string> = {
  en: "English",
  it: "Italiano",
  fr: "Francais",
  de: "Deutsch",
};

type TranslationKey =
  | "live" | "movies" | "series" | "search" | "favorites" | "settings"
  | "logout" | "language" | "accentColor" | "account" | "username"
  | "expires" | "status" | "active" | "maxConnections" | "close"
  | "selectChannel" | "noChannel" | "liveChannel" | "searchPlaceholder"
  | "noResults" | "startTyping" | "noFavorites" | "noFavoritesHint"
  | "channels" | "continueWatching" | "watched" | "season"
  | "tvGuide" | "results" | "backToCategories" | "noCategories" | "noChannels"
  | "contentIndex" | "downloads" | "noDownloads" | "noDownloadsHint" | "download"
  | "searchChannels" | "audio" | "audioTrack" | "noAudioTracks"
  | "signIn" | "signUp" | "email" | "password" | "orContinueWith"
  | "alreadyHaveAccount" | "dontHaveAccount" | "signingIn" | "signingUp"
  | "syncEnabled" | "signedInAs" | "signOutAccount";

const translations: Record<AppLanguage, Record<TranslationKey, string>> = {
  en: {
    live: "Live", movies: "Movies", series: "Series", search: "Search",
    favorites: "Favorites", settings: "Settings", logout: "Logout",
    language: "Language", accentColor: "Accent Color", account: "Account",
    username: "Username", expires: "Expires", status: "Status", active: "Active",
    maxConnections: "Max Connections", close: "Close", selectChannel: "Select a channel",
    noChannel: "No channel playing", liveChannel: "Live Channel",
    searchPlaceholder: "Search channels, movies, TV series...",
    noResults: "No results found", startTyping: "Start typing to search across all content",
    noFavorites: "No favorites yet", noFavoritesHint: "Use the heart icon to save your favorite content",
    channels: "Channels", continueWatching: "Continue watching", watched: "Watched",
    season: "Season", tvGuide: "TV Guide", results: "results",
    backToCategories: "All categories", noCategories: "No categories found.",
    noChannels: "No channels found.", contentIndex: "Loading content index...",
    downloads: "Downloads", noDownloads: "No downloads yet",
    noDownloadsHint: "Use the download button on movies and series to save them",
    download: "Download", searchChannels: "Search channels...",
    audio: "Audio", audioTrack: "Audio Track", noAudioTracks: "No additional audio tracks detected",
    signIn: "Sign In", signUp: "Sign Up", email: "Email", password: "Password",
    orContinueWith: "or continue with", alreadyHaveAccount: "Already have an account?",
    dontHaveAccount: "Don't have an account?", signingIn: "Signing in...", signingUp: "Signing up...",
    syncEnabled: "Sync enabled", signedInAs: "Signed in as", signOutAccount: "Sign out",
  },
  it: {
    live: "In diretta", movies: "Film", series: "Serie TV", search: "Cerca",
    favorites: "Preferiti", settings: "Impostazioni", logout: "Esci",
    language: "Lingua", accentColor: "Colore", account: "Account",
    username: "Utente", expires: "Scadenza", status: "Stato", active: "Attivo",
    maxConnections: "Connessioni max", close: "Chiudi", selectChannel: "Seleziona un canale",
    noChannel: "Nessun canale in riproduzione", liveChannel: "Canale in diretta",
    searchPlaceholder: "Cerca canali, film, serie TV...",
    noResults: "Nessun risultato", startTyping: "Inizia a digitare per cercare",
    noFavorites: "Nessun preferito", noFavoritesHint: "Usa il cuore per salvare i tuoi contenuti preferiti",
    channels: "Canali", continueWatching: "Continua a guardare", watched: "Visto",
    season: "Stagione", tvGuide: "Guida TV", results: "risultati",
    backToCategories: "Tutte le categorie", noCategories: "Nessuna categoria.",
    noChannels: "Nessun canale trovato.", contentIndex: "Caricamento indice contenuti...",
    downloads: "Download", noDownloads: "Nessun download",
    noDownloadsHint: "Usa il pulsante download su film e serie per salvarli",
    download: "Scarica", searchChannels: "Cerca canali...",
    audio: "Audio", audioTrack: "Traccia audio", noAudioTracks: "Nessuna traccia audio aggiuntiva",
    signIn: "Accedi", signUp: "Registrati", email: "Email", password: "Password",
    orContinueWith: "oppure continua con", alreadyHaveAccount: "Hai gia un account?",
    dontHaveAccount: "Non hai un account?", signingIn: "Accesso...", signingUp: "Registrazione...",
    syncEnabled: "Sincronizzazione attiva", signedInAs: "Connesso come", signOutAccount: "Esci",
  },
  fr: {
    live: "En direct", movies: "Films", series: "Series", search: "Rechercher",
    favorites: "Favoris", settings: "Parametres", logout: "Deconnexion",
    language: "Langue", accentColor: "Couleur", account: "Compte",
    username: "Utilisateur", expires: "Expiration", status: "Statut", active: "Actif",
    maxConnections: "Connexions max", close: "Fermer", selectChannel: "Choisir une chaine",
    noChannel: "Aucune chaine en cours", liveChannel: "Chaine en direct",
    searchPlaceholder: "Rechercher chaines, films, series...",
    noResults: "Aucun resultat", startTyping: "Commencez a taper pour rechercher",
    noFavorites: "Pas de favoris", noFavoritesHint: "Utilisez le coeur pour sauvegarder vos contenus",
    channels: "Chaines", continueWatching: "Reprendre", watched: "Vu",
    season: "Saison", tvGuide: "Guide TV", results: "resultats",
    backToCategories: "Toutes les categories", noCategories: "Aucune categorie.",
    noChannels: "Aucune chaine trouvee.", contentIndex: "Chargement de l'index...",
    downloads: "Telechargements", noDownloads: "Aucun telechargement",
    noDownloadsHint: "Utilisez le bouton de telechargement sur les films et series",
    download: "Telecharger", searchChannels: "Rechercher des chaines...",
    audio: "Audio", audioTrack: "Piste audio", noAudioTracks: "Aucune piste audio supplementaire",
    signIn: "Connexion", signUp: "Inscription", email: "Email", password: "Mot de passe",
    orContinueWith: "ou continuer avec", alreadyHaveAccount: "Deja un compte?",
    dontHaveAccount: "Pas de compte?", signingIn: "Connexion...", signingUp: "Inscription...",
    syncEnabled: "Synchronisation activee", signedInAs: "Connecte en tant que", signOutAccount: "Deconnexion",
  },
  de: {
    live: "Live", movies: "Filme", series: "Serien", search: "Suche",
    favorites: "Favoriten", settings: "Einstellungen", logout: "Abmelden",
    language: "Sprache", accentColor: "Farbe", account: "Konto",
    username: "Benutzer", expires: "Ablauf", status: "Status", active: "Aktiv",
    maxConnections: "Max Verbindungen", close: "Schliessen", selectChannel: "Kanal wahlen",
    noChannel: "Kein Kanal abgespielt", liveChannel: "Live-Kanal",
    searchPlaceholder: "Kanale, Filme, Serien suchen...",
    noResults: "Keine Ergebnisse", startTyping: "Tippen Sie, um zu suchen",
    noFavorites: "Keine Favoriten", noFavoritesHint: "Verwenden Sie das Herz-Symbol zum Speichern",
    channels: "Kanale", continueWatching: "Weiterschauen", watched: "Gesehen",
    season: "Staffel", tvGuide: "TV-Programm", results: "Ergebnisse",
    backToCategories: "Alle Kategorien", noCategories: "Keine Kategorien gefunden.",
    noChannels: "Keine Kanale gefunden.", contentIndex: "Inhaltsindex wird geladen...",
    downloads: "Downloads", noDownloads: "Keine Downloads",
    noDownloadsHint: "Verwenden Sie die Download-Schaltflache bei Filmen und Serien",
    download: "Herunterladen", searchChannels: "Kanale suchen...",
    audio: "Audio", audioTrack: "Audiospur", noAudioTracks: "Keine zusatzlichen Audiospuren erkannt",
    signIn: "Anmelden", signUp: "Registrieren", email: "E-Mail", password: "Passwort",
    orContinueWith: "oder weiter mit", alreadyHaveAccount: "Bereits ein Konto?",
    dontHaveAccount: "Noch kein Konto?", signingIn: "Anmelden...", signingUp: "Registrieren...",
    syncEnabled: "Synchronisierung aktiv", signedInAs: "Angemeldet als", signOutAccount: "Abmelden",
  },
};

export function t(lang: AppLanguage, key: TranslationKey): string {
  return translations[lang]?.[key] || translations.en[key] || key;
}
