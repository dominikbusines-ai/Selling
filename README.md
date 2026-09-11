# Verkaufsliste

Eine responsive, serverlose Verkaufsübersicht für Desktop und iPhone.

Der Ordner ist bereits als vollständiges statisches GitHub-/Vercel-Projekt vorbereitet. Es gibt keine Abhängigkeiten und keinen Build-Schritt.

## Enthalten

- Gegenstände mit Name, Preis, Beschreibung und Bild anlegen
- Gesamtwert automatisch berechnen
- Einträge bearbeiten oder löschen
- Daten im Browser lokal speichern
- JSON-Export und -Import für die Übertragung zwischen Geräten
- Mobile Darstellung mit iPhone-Safe-Area-Unterstützung

## Starten

Die Website kann direkt über `index.html` geöffnet oder auf einem beliebigen statischen Webhost veröffentlicht werden. Es ist kein Build-Schritt und kein Backend erforderlich.

Die Einträge werden zunächst nur im jeweiligen Browser gespeichert. Für die Übertragung auf ein anderes Gerät: Auf dem ersten Gerät **Exportieren**, die JSON-Datei übertragen und auf dem zweiten Gerät über **Importieren** einlesen.

## Nach GitHub kopieren

Den gesamten Inhalt dieses Ordners nach `C:\Users\Kunde\Projekte\Selling` kopieren. Die Datei `index.html` muss direkt im Stammverzeichnis des GitHub-Repositories liegen.

## Über Vercel veröffentlichen

In Vercel das GitHub-Repository importieren. Als Framework-Preset kann **Other** beziehungsweise **No Framework** verwendet werden. Build Command und Output Directory bleiben leer. Vercel liefert anschließend die `index.html` direkt aus.
