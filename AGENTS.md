# Scan2Doc / S2D – Projektregeln

## Einstieg und maßgebliche Quellen

- Gilt für das gesamte bestehende Repository `andreas-nigl/scan2doc.app`.
- Vor Arbeiten Branch, HEAD, Arbeitsbaum und Remote-Stand prüfen; anschließend
  [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) lesen. Dieses versionierte Dokument ist
  die maßgebliche Projektübergabe; keine parallele Wissensbasis anlegen.
- [README.md](README.md) beschreibt Build und Tests,
  [GITHUB_SETUP.md](GITHUB_SETUP.md) Hosting und Browsergrenzen. Historische
  Uploadblockaden und ältere „nächste Schritte“ im Handoff anhand der späteren
  Abschlussvermerke und des tatsächlichen Repository-Stands einordnen.
- Aktuelle ChatGPT-Personalisierung beachten. Deutsch, präzise Ergebnisse und
  Prüfgrenzen berichten; Annahmen, offene Entscheidungen und historische
  Testergebnisse nicht als neue Tatsachen oder bestandene Prüfungen ausgeben.

## Ziel und Architektur

- Datenschutzfreundlicher Mehrseitenscanner: Kamera/Bildimport, Kantenerkennung,
  Perspektiv- und Farbkorrektur, manueller Zuschnitt/Retusche, lokale OCR zur
  Dateibenennung sowie PDF-/JPG-/PNG-Export und lokale Dokumententwürfe.
- Statische öffentliche GitHub-Pages-App unter `/scan2doc.app/`, kein Backend,
  keine Anmeldung und keine Gerätesynchronisierung. Die Testversion verschlüsselt
  lokale Entwürfe nicht; Public/Private ist kein Schutz lokaler Dokumentdaten.
- Gemeinsame Quellen für Standalone und PWA: `s2d/template.html` (UI/Icon/Lizenzen),
  `app.js` (Dokumente/Kamera/OCR/Export/Persistenz), `extras.js` (Worker-/UI-Erweiterungen),
  `image-worker.js` und `vision.js` (OpenCV-Bildverarbeitung), `metadata.js`
  (Metadaten/Dateinamen), eingebettete Bibliotheken und Modelle in `s2d/`.
- `s2d/build.mjs` erzeugt `dist/YYMMDD_HHMM_s2d.html` (Europe/Berlin);
  `s2d/build-web.mjs` erzeugt `web/`, Manifest, Worker und unveränderliche
  `assets/<Build-Fingerprint>/`. Generierte App-Dateien aus den Quellen bauen,
  keine getrennte Anwendungslogik für Online/Standalone pflegen.

## Verbindliche Invarianten und Datenverträge

- Scans, Bilder, OCR-Texte, Metadaten, Dateinamen und Ordnerzuordnungen bleiben
  ausschließlich im Browser bzw. in ausdrücklich lokal exportierten Dateien.
  Keine Dokumentdaten, privaten Sicherungen oder Regeln auf Server/GitHub laden.
- IndexedDB `s2d-documents-v2`, Datenbankversion 1, Stores `documents`, `settings`,
  `folders` erhalten. Sicherung: JSON `kind: s2d-backup`, Version 2;
  Zuordnungen: Version 1. Formate, Feldsemantik und bestehende Entwürfe kompatibel
  halten; keine implizite Datenmigration zwischen Datei-Origin und HTTPS.
- OCR-Vorschläge überschreiben keine manuellen Metadaten. Kein OCR-Start beim
  Import oder nach jeder Bearbeitung: veränderte Seiten beim Verlassen bzw.
  „Weiter“ erkennen; gleiche Revision/Sprache wiederverwenden, veraltete Ergebnisse
  verwerfen. Deutsch standardmäßig, Englisch optional; OCR-Arbeitsauflösung
  verringert nicht die Exportauflösung. Details im Handoff und `metadata.js`.
- Darstellung/Intensität sofort sichtbar übernehmen; bei schnellen Änderungen
  gewinnt die letzte. Worker-Startreihenfolge und Wiederholung nach Fehler erhalten
  (Regression `visionTask is not defined`). Dezenter Tätigkeitsindikator ohne
  flächige Bildschirmsperre.
- Zuschnitt: Sicherheitsbeschnitt 0–5 % mit unmittelbarer innerer Vorschau,
  frei verschiebbare Ecken, Kantenverschiebung nur entlang der Normalen ohne Drehung,
  Lupe/Fadenkreuz und Prüfung ungültiger Vierecke erhalten.
- Mobile Bild-/Werkzeugansicht, Drehung links/rechts, große Miniaturen,
  Ganzseitenansicht mit Zoom/Zurück und Sortierung per langem Drücken erhalten;
  bestehendes S2D-Icon und deutsche UI beibehalten.
- Ordnerregel nur nach ausdrücklicher Speicherentscheidung und erfolgreichem
  Schreiben ändern. „Nur diesmal“ und Abbrechen erhalten. Aus Downloads/Teilen
  keinen unbekannten Zielpfad ableiten; JSON überträgt keine Ordnerberechtigungen.
- Standalone vollständig ohne Internet; PWA nach vollständiger Erstvorbereitung.
  „Offline bereit“ erst nach Größen-/SHA-256-Prüfung aller Build-Ressourcen.
  Fehlende/beschädigte Dateien dürfen keine Freigabe oder gemischten Stand erzeugen.
- Service-Worker-Scope/Cache-Namen auf den App-Pfad begrenzen; keine fremden
  App-Caches, APIs, Dokumente, Schreibanfragen oder `downloads/` cachen.
  Vorversion erhalten, keine erzwungene Aktivierung/Reload während Bearbeitung.
  Updatefehler heben bestätigte Offlinebereitschaft nicht auf.

## Datenschutz und Sicherheitsgrenzen

- Keine Secrets/API-Schlüssel, privaten Scans oder Nutzersicherungen committen;
  Tests ausschließlich mit synthetischen bzw. nachweislich geeigneten Daten.
- Keine Cloud-OCR, Telemetrie oder externen Laufzeit-CDNs einführen. Lokale
  OpenCV-/Tesseract-/PDF-Bibliotheken, Sprachdaten und Lizenzhinweise erhalten;
  Abhängigkeitsänderungen auf Herkunft, Lizenz, Sicherheit und Offlinefähigkeit prüfen.
- Eingabe-/Backupvalidierung, Dateinamensbereinigung, Berechtigungsfehler,
  Worker-Fehler und mögliche Datenabflüsse risikobasiert prüfen. Neue Anmeldung,
  Synchronisierung oder Verschlüsselung erfordert einen gesonderten Auftrag.
- Kamera-/Ordnerrechte bleiben Browserentscheidungen; HTTPS hebt Android- oder
  Downloadordner-Beschränkungen nicht auf. Teilen/Download als Fallback erhalten.
- Browserspeicher/Persistenzzusage ist keine dauerhafte Sicherung. Keine Garantie
  gegen Löschen/Verdrängung behaupten; „Dokumente sichern / Sicherung einlesen“ erhalten.

## Entwicklung und verbindliche Prüfungen

- Kleine reversible Korrekturen direkt, größere Implementierungen erst nach
  kurzem Ziel-/Anforderungs-/Abnahmekriterienabgleich und Freigabe. Fachlich
  zusammenhängende, nach Risiko und Ausführungsstabilität bemessene Arbeitsblöcke.
  Bestehende Funktionen und fremde Änderungen erhalten, minimal ändern.
- Builds aus Repositorywurzel mit Node.js ≥20: `node s2d/build.mjs` und
  `node s2d/build-web.mjs`. Build-Syntaxprüfungen beider Fassungen beachten.
- Bei Änderungen an App/Build die relevanten Regressionen ausführen:
  `node s2d/qa/integration.cjs`, `node s2d/qa/ocr-offline.cjs`, beide zusätzlich
  mit `S2D_TEST_WEB=1`; für PWA `node s2d/qa/offline.cjs` und
  `node s2d/qa/offline-client.cjs`. Integration benötigt `@napi-rs/canvas` über
  `CODEX_PRIMARY_RUNTIME_NODE_MODULES`; siehe README. Keine Abhängigkeit ungeprüft ersetzen.
- Referenzfälle: Start mit Microtask-Pausen/Retry; zwei importierte Seiten ohne OCR;
  Graustufen/35 %, schnelle Regleränderungen; OCR-Lebenszyklus/manuelle Felder;
  Beschnitt/Lupe/parallele Kanten; Drehen/Zurück/Sortierung; Entwurf wiederöffnen;
  Speicherentscheidung und Zwei-Seiten-PDF. OCR-Referenz `s2d/qa/input.png`:
  Allianz, 22.09.2026, 785,62 EUR bei blockiertem Netzwerk.
- Offline-Akzeptanz: vollständige geprüfte Ressourcen ohne Netz, keine falsche
  Bereitschaft bei Teilkopien, Vorversion/fremde Caches erhalten, korrekter
  Offline-Start-/Update-/Persistenzstatus. Aktuelle Ressourcenliste aus
  `s2d/WEB_BUILD.json`, keine historische Ressourcenanzahl fest verdrahten.
- Betroffene Bedienabläufe in der tatsächlich erzeugten HTML im Browser prüfen;
  DOM-/IndexedDB-/Worker-Simulationen ausdrücklich als solche benennen. Lint-,
  Type-, Build- und Sicherheitsprüfungen passend zur Änderung durchführen;
  fehlende Konfiguration oder nicht ausführbare Prüfungen nennen, nichts erfinden.
  Bei reinen Dokumentationsänderungen Inhalt, Referenzen und Git-Diff prüfen.
- Offen laut Handoff: vollständiger echter S23-Kamera-/Touch-/Flugmodustest,
  Android-Speicherwarnung und durchgängiger Browser-Bildimporttest. Keine Behebung,
  Geräteperformance oder Gleichwertigkeit mit Adobe Scan ohne neuen Nachweis behaupten.

## Handoff, Commit, Push und Veröffentlichung

- Nach abgeschlossenem Entwicklungsblock `PROJECT_HANDOFF.md` fortführen:
  Branch/Commit, verfügbare Builds, Tests samt Grenzen, Nutzerabnahme, offene
  Wünsche und nächster freigegebener Schritt. Online und Standalone getrennt
  ausweisen; bei längeren Arbeiten nutzbare Zwischenstände sichern.
- Bei Wiedereinstieg tatsächlich gesicherte/veröffentlichte Commits und Builds
  prüfen, bevor fehlgeschlagene Uploads wiederholt werden. Historische Berichte
  unter `s2d/qa/` sind keine aktuellen Testläufe.
- Nach ausdrücklich freigegebenem Entwicklungsauftrag abgeschlossene, erfolgreich
  geprüfte Blöcke samt Handoff ohne weitere Einzelfreigabe ins bestehende freigegebene
  Repository committen/pushen. Diff und Remote-HEAD vorher prüfen; nur Fast-Forward,
  keine fremden Commits überschreiben, Fehler/Konflikte nicht erzwingen.
- App-Veröffentlichung: GitHub Pages verwendet `main` und `/(root)`; daher vor
  Push prüfen, ob ausgelieferte Dateien betroffen sind. Im freigegebenen Umfang
  `deployFiles` aus `WEB_BUILD.json` gemeinsam übernehmen, alte aktive Assetpfade
  erhalten; anschließend öffentliche HTTP-Dateien/Prüfsummen kontrollieren.
  Neue Repositories, Releases, Rechteänderungen, destruktive Eingriffe und andere
  nicht freigegebene Veröffentlichungen benötigen gesonderte Freigabe.
- Standalone bleibt aus den gemeinsamen Quellen reproduzierbar; bei angeforderter
  Lieferung direkt als HTML bereitstellen (letzte Nutzerentscheidung), nicht nur ZIP.
  Verfügbarkeit von App-/Downloadlinks tatsächlich prüfen.
