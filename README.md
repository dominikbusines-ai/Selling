# Verkaufsliste

Eine responsive, serverlose Verkaufsübersicht für Desktop und iPhone.

Der Ordner ist als vollständiges statisches GitHub-/Vercel-Projekt vorbereitet. Die Verkaufsdaten werden nach der Anmeldung über Supabase synchronisiert; ohne Anmeldung bleibt die lokale Speicherung als Fallback aktiv. Es gibt keinen Build-Schritt.

## Enthalten

- Gegenstände mit Name, Preis, Beschreibung und Bild anlegen
- Gesamtwert automatisch berechnen
- Einträge bearbeiten oder löschen
- Daten lokal speichern oder nach Anmeldung automatisch mit Supabase synchronisieren
- Mobile Darstellung mit iPhone-Safe-Area-Unterstützung
- KI-Assistent für Beschreibung, Verbesserung, Preisempfehlung und eigene Fragen
- Verkaufsstatus mit tatsächlichem Verkaufspreis und Verkaufsübersicht

## Starten

Die Website kann direkt über `index.html` geöffnet oder auf einem beliebigen statischen Webhost veröffentlicht werden. Es ist kein Build-Schritt und kein Backend erforderlich.

Ohne Anmeldung werden die Einträge im jeweiligen Browser gespeichert. Mit einem Supabase-Konto werden Einträge und Bilder online gespeichert und auf PC sowie iPhone synchronisiert. Die Website verwendet den öffentlichen Supabase-Publishable-Key; die Zugriffssicherheit erfolgt über RLS-Policies in Supabase.

## Nach GitHub kopieren

Den gesamten Inhalt dieses Ordners nach `C:\Users\Kunde\Projekte\Selling` kopieren. Die Datei `index.html` muss direkt im Stammverzeichnis des GitHub-Repositories liegen.

## Über Vercel veröffentlichen

In Vercel das GitHub-Repository importieren. Als Framework-Preset kann **Other** beziehungsweise **No Framework** verwendet werden. Build Command und Output Directory bleiben leer. Vercel liefert anschließend die `index.html` direkt aus.

## Als iPhone-App installieren

Nach dem Deployment die Website in Safari öffnen. Im Teilen-Menü „Zum Home-Bildschirm“ wählen, „Als Web-App öffnen“ aktivieren und „Hinzufügen“ antippen. Die Verkaufsliste startet anschließend über ihr eigenes Symbol ohne Safari-Adressleiste. Falls nötig, in der App einmal mit dem bisherigen Konto anmelden.

Die PWA benötigt HTTPS (bei Vercel automatisch vorhanden). Zum Laden und Speichern der Online-Einträge sowie für die KI wird Internet benötigt. Bei einem Start ohne Verbindung erscheint ein Offline-Hinweis mit „Erneut versuchen“. Der Service Worker speichert ausschließlich diese neutrale Hinweisseite; die Website wird bei jedem Öffnen aus dem Netz geladen. Updates laden kein geöffnetes Formular automatisch neu.

Die PNG-Symbole liegen in `icons/` und sind bereits enthalten. Bei Änderungen am Markenzeichen können sie unter Windows mit `scripts/generate-icons.ps1` neu erzeugt werden.

## Anthropic-KI in Vercel

In Vercel unter **Settings → Environment Variables** diese Variable als **Secret** für Production, Preview und Development hinterlegen:

```text
ANTHROPIC_API_KEY
```

Der Wert ist der persönliche Anthropic-API-Key. Er wird ausschließlich in `api/ai.js` auf dem Server verwendet und nie an den Browser ausgeliefert. Die KI-Funktionen stehen nur angemeldeten Benutzern zur Verfügung.

Für die KI-Anfrage werden die Daten des ausgewählten Gegenstands und – falls vorhanden – sein Bild an Anthropic übertragen. Die voreingestellten Aufgaben sind Beschreibung schreiben, Beschreibung verbessern und Preisempfehlung; zusätzlich kann eine eigene Frage gestellt werden.

Die optionalen öffentlichen Variablen `SUPABASE_URL` und `SUPABASE_PUBLISHABLE_KEY` sind in `.env.example` dokumentiert. Sie müssen nicht angelegt werden, wenn die bereits im Projekt hinterlegten öffentlichen Werte verwendet werden.

## Wertgegenstände aktivieren

Vor dem Deployment einmal `supabase-valuables.sql` im Supabase SQL Editor ausführen. Die neue Spalte `category` trennt die Einträge in Verkaufsliste und Wertgegenstände. Bestehende Einträge werden der Verkaufsliste zugeordnet; die bisherigen Zugriffsregeln gelten weiterhin. Ohne diese Migration können neue Speichervorgänge fehlschlagen.

Die Navigation öffnet den eigenen Bereich über `#wertgegenstaende`. Dort werden Name, Wert und Bild gespeichert; Bearbeiten, Löschen, Kompaktansicht und Bildvergrößerung stehen ebenfalls zur Verfügung. Die Gesamtsumme enthält ausschließlich Wertgegenstände. Beschreibung, Verkaufsstatus, Bereit-Status und KI sind dort nicht verfügbar.

## Verkaufsstatus einrichten

Nach dem Einspielen der Website einmal `supabase-sold-items.sql` im Supabase SQL Editor ausführen. Das Skript ergänzt den Verkaufsstatus und den Status „Bereit zum Verkauf“. Danach können Gegenstände als verkauft oder als fertig eingerichtet markiert werden. Der Gesamtwert zeigt dann nur noch nicht verkaufte Gegenstände; der separate Verkaufswert zeigt die tatsächlichen Verkaufspreise und öffnet per Klick die Verkaufsliste.
