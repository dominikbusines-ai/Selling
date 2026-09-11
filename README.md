# Verkaufsliste

Eine responsive, serverlose Verkaufsübersicht für Desktop und iPhone.

Der Ordner ist als vollständiges statisches GitHub-/Vercel-Projekt vorbereitet. Die Verkaufsdaten werden nach der Anmeldung über Supabase synchronisiert; ohne Anmeldung bleibt die lokale Speicherung als Fallback aktiv. Es gibt keinen Build-Schritt.

## Enthalten

- Gegenstände mit Name, Preis, Beschreibung und Bild anlegen
- Gesamtwert automatisch berechnen
- Einträge bearbeiten oder löschen
- Daten lokal speichern oder nach Anmeldung automatisch mit Supabase synchronisieren
- JSON-Export und -Import für die Übertragung zwischen Geräten
- Mobile Darstellung mit iPhone-Safe-Area-Unterstützung
- KI-Assistent für Beschreibung, Verbesserung, Preisempfehlung und eigene Fragen

## Starten

Die Website kann direkt über `index.html` geöffnet oder auf einem beliebigen statischen Webhost veröffentlicht werden. Es ist kein Build-Schritt und kein Backend erforderlich.

Ohne Anmeldung werden die Einträge im jeweiligen Browser gespeichert. Mit einem Supabase-Konto werden Einträge und Bilder online gespeichert und auf PC sowie iPhone synchronisiert. Die Website verwendet den öffentlichen Supabase-Publishable-Key; die Zugriffssicherheit erfolgt über RLS-Policies in Supabase.

## Nach GitHub kopieren

Den gesamten Inhalt dieses Ordners nach `C:\Users\Kunde\Projekte\Selling` kopieren. Die Datei `index.html` muss direkt im Stammverzeichnis des GitHub-Repositories liegen.

## Über Vercel veröffentlichen

In Vercel das GitHub-Repository importieren. Als Framework-Preset kann **Other** beziehungsweise **No Framework** verwendet werden. Build Command und Output Directory bleiben leer. Vercel liefert anschließend die `index.html` direkt aus.

## Anthropic-KI in Vercel

In Vercel unter **Settings → Environment Variables** diese Variable als **Secret** für Production, Preview und Development hinterlegen:

```text
ANTHROPIC_API_KEY
```

Der Wert ist der persönliche Anthropic-API-Key. Er wird ausschließlich in `api/ai.js` auf dem Server verwendet und nie an den Browser ausgeliefert. Die KI-Funktionen stehen nur angemeldeten Benutzern zur Verfügung.

Für die KI-Anfrage werden die Daten des ausgewählten Gegenstands und – falls vorhanden – sein Bild an Anthropic übertragen. Die voreingestellten Aufgaben sind Beschreibung schreiben, Beschreibung verbessern und Preisempfehlung; zusätzlich kann eine eigene Frage gestellt werden.

Die optionalen öffentlichen Variablen `SUPABASE_URL` und `SUPABASE_PUBLISHABLE_KEY` sind in `.env.example` dokumentiert. Sie müssen nicht angelegt werden, wenn die bereits im Projekt hinterlegten öffentlichen Werte verwendet werden.
