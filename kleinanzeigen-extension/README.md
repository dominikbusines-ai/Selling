# Selling → Kleinanzeigen (PC, Version 0.3 – Live-Prüfung ausstehend)

## Aktualisierung 0.3

Nach Dateiänderungen das temporäre Add-on in `about:debugging` neu laden und den Kleinanzeigen-Tab ebenfalls neu laden. Preisfelder erhalten ganze Eurobeträge ohne Dezimalstellen; Text-/Telefonfelder verwenden für Centbeträge ein Komma, native Zahlenfelder einen Punkt. Bitte den Endpreis kontrollieren. „Nur Abholung“ wird einmalig über eine eindeutig beschriftete Radio- oder Auswahloption ausgewählt; wenn das Feld nicht erkannt wird, erscheint ein Hinweis statt einer geratenen Auswahl. Spätere manuelle Änderungen bleiben erhalten.

Die Website schlägt auf Detailkarten eine KI-Kategorie vor. Grundlage sind die 147 Unterkategorien der öffentlichen Übersicht https://www.kleinanzeigen.de/s-kategorien.html, Stand 10.10.2026, gespeichert in `kleinanzeigen-categories.json`. Weitere kategoriespezifische Formularmerkmale sind nicht Bestandteil dieser Liste. Die Kategorie wird nicht automatisch im Fremdformular ausgewählt.

Beim Laden der Verkaufsliste werden angemeldeten Nutzern Empfehlungen für unverkaufte Artikel in Gruppen von acht erstellt (nur Namen/Beschreibungsauszüge, keine Bilder). Ergebnisse werden benutzerspezifisch auf dem Gerät zwischengespeichert. Änderungen am Text oder der Kategorienliste lösen eine neue Prüfung aus. Das erzeugt beim ersten Öffnen KI-Kosten; erneutes Öffnen unveränderter Einträge verwendet die gespeicherten Ergebnisse. Keine Supabase-Datenänderung oder Migration.

## Firefox (ab Version 140): vorläufig installieren

1. `about:debugging#/runtime/this-firefox` in Firefox öffnen.
2. „Temporäres Add-on laden …“ anklicken.
3. `C:\Users\Kunde\Projekte\Selling\kleinanzeigen-extension\manifest.json` auswählen.
4. Die veröffentlichte Selling-Website neu laden. Falls Firefox den Website-Zugriff anfragt, für Selling und Kleinanzeigen erlauben.

Das temporäre Add-on wird beim vollständigen Beenden von Firefox entfernt. Für die dauerhafte Installation in regulärem Firefox ist eine von Mozilla signierte Erweiterung nötig, auch bei privater/unveröffentlichter Verteilung. Die Signierung wurde nicht vorgenommen. Sicherheitsprüfungen nicht deaktivieren.

Die Firefox-Einwilligung nennt „Website-Inhalte“, weil der ausdrücklich ausgewählte Artikel mit Bild an Kleinanzeigen übergeben wird. Keine Analysedienste oder Übermittlung anderer Artikel. Ihre Bestätigung vor jeder Übergabe bleibt erhalten.

Quellen: https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/ und https://extensionworkshop.com/documentation/publish/install-self-distributed/

## Schutz bestehender Daten

Diese Erweiterung liest einen ausdrücklich freigegebenen Artikel. Sie hat keinen Supabase-Schlüssel, führt keine Datenbankänderungen aus, löscht keine Artikel und veröffentlicht keine Anzeigen. Sie greift weder auf Passwörter noch auf Cookies zu. Ein vorhandener Text im Zielformular wird nicht überschrieben. Die Felder werden ausschließlich anhand eindeutiger Beschriftungen zugeordnet; unbekannte Felder bleiben unangetastet.

## Installation in Chrome oder Edge

1. Die Website-Änderungen wie gewohnt über GitHub/Vercel veröffentlichen.
2. In Chrome `chrome://extensions`, in Edge `edge://extensions` öffnen.
3. Entwicklermodus einschalten, „Entpackte Erweiterung laden“ wählen.
4. Diesen Ordner `kleinanzeigen-extension` auswählen (nicht den gesamten Selling-Ordner).
5. `https://selling-tau.vercel.app` neu laden. In der Website erscheint „Inserieren“ bei unverkauften Verkaufsartikeln; auch im Bearbeitungsfenster verfügbar.

Die Erweiterung ist nur für diese konkrete Selling-Adresse freigegeben. Bei einer anderen Domain müssen `manifest.json`, `bridge.js` und `background.js` ausdrücklich angepasst werden. Kein iPhone-Support für diese PC-Erweiterung.

## Ablauf

1. Änderungen am Artikel zuerst speichern. Übertragen wird der gespeicherte Artikel, nicht eine ungespeicherte Bearbeitung.
2. „Inserieren“ anklicken und die Übertragung bestätigen. Titel, Beschreibung, Preis und gegebenenfalls das Originalbild werden übergeben.
3. Kleinanzeigen öffnet sich in einem neuen Tab. Falls nötig, anmelden und anschließend im selben Tab „Anzeige aufgeben“ öffnen.
4. Die Erweiterung versucht die bekannten leeren Felder zu befüllen. Nach der Kategorieauswahl gegebenenfalls „Daten eintragen / ergänzen“ drücken.
5. Unbedingt Titel, Beschreibung, Bild-Upload, Preis einschließlich Dezimalstellen, Festpreis/VB, Kategorie, Versand und Standort kontrollieren. Fehlende/mehrdeutige Felder manuell ergänzen.
6. Nur Sie selbst klicken auf die Veröffentlichung. Danach „Übergabe beenden“ oder den Tab schließen.

Entwurfsdaten liegen nur im Sitzungsspeicher der Erweiterung (nicht synchronisiert), werden nach 30 Minuten nicht mehr ausgegeben und beim Schließen des Ziel-Tabs bzw. Beenden des Browsers entfernt. Es werden keine Daten an weitere Anbieter übertragen. Pro Artikel derzeit ein JPG-, PNG- oder WebP-Bild bis 5 MB. HEIC wird nicht stillschweigend ausgelassen, sondern als Fehler gemeldet.

## Wichtige Grenzen

Der öffentliche Abruf des Einstellformulars lieferte während der Entwicklung HTTP 403. Es wurden keine Zugriffssperren umgangen. Die Feldzuordnung ist daher ein lokal getesteter Prototyp, keine bestätigte Live-Integration. Kategorieablauf, Anmeldung und Upload im echten Konto müssen vor produktiver Nutzung manuell geprüft werden. Bei Layoutänderungen oder nicht erkannten Feldern stoppt die Zuordnung für diese Felder. Captchas und andere Schutzmechanismen werden nicht bedient oder umgangen.

Die Nutzungsbedingungen enthalten Einschränkungen für automatisierte Zugriffe. Eine Freigabe dieses Ablaufs durch Kleinanzeigen ist nicht bestätigt; vor produktiver Verwendung die Zulässigkeit mit Kleinanzeigen klären. Keine Verbindung zur Veröffentlichungsschnittstelle und keine Zusage, dass Kleinanzeigen die Befüllung akzeptiert.
