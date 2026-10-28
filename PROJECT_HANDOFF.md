# S2D – maßgeblicher Projektstand

Version 6 · 28.10.2026 · Veröffentlichung und HTTP-Prüfung bestätigt

## Ausgangspunkt und Wiederherstellung

Der vorherige Arbeitsbereich war automatisch bereinigt worden. Der Nutzer hat
`260922_1659_s2d.html` erneut bereitgestellt. Daraus wurden alle Anwendungsteile,
Bibliotheken, Sprachmodelle, Lizenzen und das bestehende S2D-Icon verlustfrei
herausgelöst. Die Ausgangsversion ist im lokalen Git-Verlauf gesichert.
Eine frühere separate Übergabedokumentation war nicht vorhanden. Dieses Dokument
ist ab jetzt die fortzuführende Projektquelle; keine parallele Wissensbasis anlegen.

## Aktueller Stand

- Lokale Standalone: `261027_1646_s2d.html`, 26873449 Byte, unverschlüsselt.
- Standalone SHA-256: `096f7996fcc914b032ef9075fab9bb2b3f7aba1916dfc807d8fbbdf999fb12aa`.
- Webfassung: `web/index.html`, 45347 Byte; Offline-Dateien insgesamt
  23764510 Byte, 17 geprüfte Ressourcen; Build `bf0f3cc571d924da`.
- Beide Fassungen entstehen aus denselben `s2d/app.js`, `extras.js`, `metadata.js`,
  `vision.js`, der Oberfläche und den bestehenden Bibliotheken. Keine getrennte App-Logik.
- Dateinamenszeit Europe/Berlin. Standalone-Build UTC `2026-10-27T15:46:08.430Z`.
- Tatsächliches Repository: `andreas-nigl/scan2doc.app`, Public, Branch `main`.
  Öffentlich erreichbar: https://andreas-nigl.github.io/scan2doc.app/
  Pages-Veröffentlichung erfolgreich; Details und Prüfumfang am Dokumentende.
  Der frühere Name `s2d.app` war nur ein Vorschlag und ist nicht der Repositoryname.
- Webdateien und Quellen werden gemeinsam veröffentlicht. Die unveränderte Standalone
  liegt zusätzlich unter `downloads/261027_1646_s2d.zip`. Keine persönlichen Scans,
  Ordnerregeln oder Dokumentensicherungen werden hochgeladen.
- Daten bleiben ausschließlich im Browser. Offlinekopie hält Programm und OCR vor;
  IndexedDB hält mehrere Dokumente und laufende Scan-Entwürfe. Export erzeugt lokale
  Dateien. Keine Synchronisierung und kein Server-Endpunkt für Dokumentdaten.
- S2D-Icon unverändert als vorhandene SVG übernommen; PNG-Größen 192 und 512 Pixel
  wurden daraus für die Installation gerendert. GitHub-Referenz OFP2Flyer geprüft:
  dessen Sites-Favicon ist ein generisches Hosting-Icon und ersetzt das S2D-Icon nicht.

## Wiederherstellung und Startfehler vom 21.10.2026

Der Arbeitsbereich wurde erneut automatisch bereinigt. Die korrigierte Version
`261021_0013_s2d.html` samt Quellpaket war wegen eines Zugriffsfehlers nicht dauerhaft
abgelegt worden. Aus der vollständigen, SHA-256-verifizierten HTML vom 14.10.2026
und dem CRC-geprüften Git-Bundle im teilweise abgeschnittenen alten ZIP wurde der
Quellstand wiederhergestellt. Die Startkorrektur vom 21.10. wurde aus dem sichtbaren
Gespräch erneut angewendet und geprüft; sie ging beim Wechsel zur Webfassung nicht verloren.

Ursache von `visionTask is not defined`: Die Promise-Microtask in app.js startete
vor dem nachfolgenden extras.js-Skript. Die alten Tests hatten alle Skripte synchron
abgespielt und diesen Browser-Ablauf verfehlt. Ein grüner Funktionstest war damals
kein Beleg eines erfolgreichen Browserstarts. Jetzt startet die App explizit erst
am Ende von extras.js. Die Tests warten zwischen HTML-Skripten. Ein fehlgeschlagener
Worker-Start ist wiederholbar, statt alle späteren Bildimporte dauerhaft zu blockieren.
Die Standalone erzeugt den Worker aus Blob-Teilen und hält dessen URL bis zur ersten
Antwort vor. Beim Import wird nur einmal kodiert und die temporäre Canvas freigegeben.

Die zusätzliche Android-Meldung „Zu wenig Speicher für vorherige Operation“ bleibt
als tatsächlicher Gerätefehler ungeklärt. Kein bestätigter RAM-Benchmark und keine
behauptete Behebung allein durch den Hostingwechsel.

## Architekturentscheidung vom 27.10.2026

Freigegeben: öffentliche GitHub-Onlinefassung mit funktionierendem Offlinebetrieb;
ChatGPT Sites wurde als Alternative erfragt. Empfehlung und Umsetzung: statische
PWA für lokale Verarbeitung, kein Backend und keine neue Synchronisierung.
OFP2Flyer-Referenzen `src/offline_client.js` und `src/offline_worker.js` wurden im
verbundenen Repository tatsächlich gelesen. Dessen Anmeldung/Serverregeln werden
nicht in den öffentlichen lokalen Scanner kopiert; übernommen wird das Prinzip
geprüfter Offlinekopie, Status und Fortbestand der lokalen Nutzdaten.

- Kleine Online-HTML; ausführbare Skripte extern und in definierter Reihenfolge.
- Unveränderliche Assetpfade `assets/<Build-Fingerprint>/`. Die Build-Identität
  berücksichtigt Quellen, Oberfläche, erzeugende Build-Logik, Worker und Ressourcen.
- OpenCV wird direkt im Bild-Worker geladen. Hauptdokument enthält online weder
  dessen riesigen Quelltext noch Base64-OCR-Daten. OCR-Worker und rohe deutsche/
  englische Sprachdaten werden von derselben App-Adresse geladen.
- Service Worker installiert alle 17 Ressourcen, prüft Bytezahl und SHA-256 und
  setzt erst danach den Bereitschaftsmarker. Teilkopien werden bei Fehler entfernt.
- Offline-Navigation zum App-Hauptpfad und index.html wird aus der geprüften Kopie
  bedient. App-Ressourcen benötigen danach kein Netz. API-Daten, Dokumente, fremde
  Projekte, Downloads und Schreibanfragen werden nicht gecacht.
- Scope und Cache-Namen sind pfadbezogen. Keine Root-Übernahme anderer GitHub-Apps.
  Aktivierung bewahrt eine vorige Programmfassung und löscht keine fremden App-Caches.
- Keine erzwungene Aktivierung, kein Reload mitten in der Bearbeitung. Neue Fassung
  wird nach vollständiger Installation und Schließen der alten App-Fenster aktiv.
- Der Offline-Client prüft die bestehende Kopie vor einer möglichen Netzregistrierung.
  Fehlgeschlagene Updateprüfung darf die bestätigte Offlinebereitschaft nicht aufheben.
- Manifest mit relativem Startpfad/Scope, vorhandenes S2D-Icon, Installationsbutton
  bei Browserfreigabe. Offlineverwaltung kompakt in einem aufklappbaren Bereich.
- Persistenter Browserspeicher kann angefragt werden; verweigerte Zusage wird korrekt
  angezeigt. Lokale Entwürfe sind weiterhin zu sichern; keine Garantie gegen Löschen.
- Datenbankname `s2d-documents-v2`, Stores und Sicherungs-/Regelformate unverändert.
  Keine automatische Migration zwischen file/content-Origin und HTTPS. Backup importieren.
- Keine persönlichen Daten im Webpaket. Kein neuer Passwortschutz und keine neue
  Verschlüsselung in dieser Testversion. Persönliche JSON-Dateien nicht öffentlich hochladen.

## Umgesetzte Anforderungen

1. **Darstellung und Intensität:** Der bestätigte Fehler „renderPages setzt Werte
   zurück, bevor sie gelesen werden“ wurde beseitigt. Auswahl wird vor einem
   Rendern erfasst. Regler zeigt sofort den gewünschten Prozentwert. Vorschauen
   werden zusammengefasst; bei konkurrierenden Änderungen gewinnt die letzte.
   Der vollständige PNG-Arbeitsstand folgt nach dem Loslassen. Navigation wartet
   auf die endgültige Fassung, ohne einen vollständig abgedunkelten Bildschirm.
2. **Bildverarbeitung:** OpenCV läuft in einem eigenen Worker. Erkennung,
   Entzerrung, Filter und Drehung laufen dort. Die Beleuchtungskorrektur der
   zuletzt verwendeten Originalfläche wird zwischengespeichert. Ein dezenter
   Spinner mit Tätigkeitsbeschreibung zeigt Arbeit an. Worker-Fehler und ein
   Timeout nach 90 Sekunden führen zu einer Meldung und ermöglichen einen Retry.
3. **OCR:** Kein Start beim Import und kein Start nach jeder Bildmodifikation.
   Beim Wechsel zwischen Seiten in der Prüfung wird die verlassene Seite
   vorgemerkt; „Weiter“ merkt ausstehende Seiten vor. Identische Revision und
   Sprache verwenden vorhandene Ergebnisse. Verspätete Ergebnisse veränderter
   Seiten werden verworfen. Manuell bearbeitete Metadaten bleiben erhalten.
   Deutsch ist Standard; Englisch kann unter Einstellungen zugeschaltet werden.
   OCR-Arbeitskopie maximal 2.000 Pixel lange Kante; Exportauflösung bleibt erhalten.
   Eine bereits laufende OCR kann während erneuter Bearbeitung noch zu Ende laufen;
   das veraltete Ergebnis wird nicht als aktuelles Ergebnis übernommen.
4. **Zuschnitt:** Sicherheitsbeschnitt 0 / 0,5 / 1 / 1,5 / 2 / 3 / 4 / 5 Prozent.
   Gelbe innere Linie zeigt sofort denselben verbleibenden Bereich wie die spätere
   Verarbeitung. Die bestehende Geometrie zieht Punkte proportional zum Mittelpunkt
   ein; bei einem Rechteck entsprechen 5 Prozent einem Rand von 5 Prozent je Seite.
   Ecken frei bewegen; Kanten nur entlang ihrer Normalen parallel verschieben.
   Keine Verschiebung entlang der Kante und keine Drehung durch den Kantengriff.
   Ungültige Vierecke werden abgewiesen. Lupe mit Fadenkreuz erscheint beim Ziehen.
5. **Bedienung:** Kompakte, an die Viewporthöhe angepasste Prüfung mit Bild und
   Werkzeugen; getrennte Drehbuttons links/rechts. Miniaturen ohne großen
   Ziehbutton, Seitenzahl darüber. Antippen öffnet eine Ganzseitenansicht;
   Zurück/Schließen kehrt zur vorherigen Position zurück. Pinch, Ziehen,
   Doppeltippen und Mausrad für die Detailansicht. Lange drücken und ziehen zum
   Sortieren; kurze horizontale Bewegung scrollt die Miniaturen. Alt+Pfeil
   verschiebt eine fokussierte Miniatur am Desktop.
6. **Speichern:** Ausgerichtete, gleich hohe Format-/Ordnerfelder. Ordnername in
   einer eigenen Zeile. Bei bekanntem Absender und ausgewähltem Ordner fragt
   „Jetzt speichern“: Speichern und merken / Nur diesmal speichern / Abbrechen.
   Eine Regel wird erst nach erfolgreichem Schreiben übernommen. Ohne direkten
   Ordnerzugriff bleiben Dateispeichern, Teilen und Downloads verfügbar.
7. **Entwürfe:** Datenbankname und Stores bleiben erhalten. Vollständige JSON-
   Serialisierung zur internen Kopie entfällt; nahe beieinander liegende
   Speichervorgänge werden pro Dokument zusammengefasst. Sicherungsformat bleibt
   Version 2; Zuordnungsformat bleibt Version 1. Vor dem Öffnen einer neu benannten
   HTML die alte App mit „Dokumente sichern“ sichern und bei Bedarf wieder einlesen.

## Tests und tatsächliche Grenzen

`s2d/qa/results.json` enthält 16 bestandene Integrationsprüfungen gegen die aus
der erzeugten HTML extrahierten Skripte. Dabei liefen echter OpenCV-Code,
Canvas-Bildverarbeitung, der Bild-Worker und PDF-Erzeugung. DOM, IndexedDB,
Dateidialoge und OCR-Auftragssteuerung wurden simuliert. Getestet wurden:

- Start mit Microtask-Pausen und Wiederholung eines fehlgeschlagenen Worker-Starts.
- Zwei Aufnahmen bleiben zwei Seiten; beim Import keine OCR.
- Graustufen/35 Prozent, schnelle Regleränderungen, Original und Schwarz-Weiß.
- OCR bei Seitenwechsel/Weiter, Ergebniswiederverwendung, manuelle Feldkorrekturen.
- Sofort sichtbarer Sicherheitsbeschnitt, parallele Kanten und Lupe.
- Links-/Rechtsdrehung, Ganzseitenansicht, Zurück, Reihenfolge.
- Speicherabfrage, Abbrechen, Zwei-Seiten-PDF, Ordnerregeln nach Schreiben.
- Entwurf wieder öffnen und verspätete OCR nach Änderungen verwerfen.

Zusätzlich führt `s2d/qa/ocr-offline.cjs` die tatsächlich eingebettete OCR-Laufzeit
mit deutschen Sprachdaten und gesperrtem Netzwerk aus. Die synthetische Rechnung
wird mit Absender, 22.09.2026 und 785,62 EUR erkannt. Ergebnis in `ocr-result.json`.
Dies ist kein allgemeiner Genauigkeitsnachweis für andere Vorlagen oder Handschrift.

Für die Webfassung bestehen dieselben 16 Funktionsprüfungen (`web-results.json`).
Die tatsächlich ausgelieferte Web-OCR lief mit deaktiviertem Netzwerk auf der
synthetischen Rechnung (`web-ocr-result.json`); die Web-Worker-/Sprachdateien sind
bytegleich mit den geprüften eingebetteten Daten.

Sieben Service-Worker-Prüfungen (`offline-results.json`) prüfen vollständige und
SHA-256-geprüfte Installation, Navigation und alle Ressourcen ohne Netz, Ausschluss
privater/fremder Daten, fehlende/beschädigte Dateien, Erhalt der Vorversion und die
Vollständigkeit von Manifest und Worker-Importen. Fünf Offline-Client-Prüfungen
(`offline-client-results.json`) prüfen Start ohne Neuregistrierung bei fehlendem
Netz, Erhalt des bestätigten Offline-Status bei Netzfehler, keine falsche Freigabe,
Aktivierung der Erstinstallation sowie Update- und Speicherhinweise.
CacheStorage, DOM, Browser-Lebenszyklus, Netz und Worker-Kanäle werden simuliert.
SHA-256, App-Dateien, OpenCV, Canvas, OCR-Laufzeit und PDF-Code sind echt.

**Offen bleibt die echte Browser-/Geräteprüfung.** In dieser Umgebung war kein
Browser installiert; die Playwright-Installation lieferte kein gültiges
Browserarchiv. Deshalb keine behauptete Sichtprüfung, kein Android-Benchmark und
keine bestätigte Prüfung nativer Ordnerdialoge oder tatsächlicher Touch-Gesten.
Die Integrationstests ersetzen diese Prüfung nicht. Die Webseite benötigt für
die Worker-Bildverarbeitung einen aktuellen Browser mit OffscreenCanvas und
createImageBitmap; Ziel ist aktuelles Chrome auf dem Samsung S23 und Desktop.

Die frühere Bildqualitätsrunde ist im Gespräch dokumentiert, aber ihre Testdateien
sind nach der Workspace-Bereinigung nicht mehr vorhanden. Sie wurde in diesem
Arbeitsblock nicht als neuer Test wiederholt. Keine Gleichwertigkeit zu Adobe Scan
behaupten. Der Scanalgorithmus und die automatische Farbkorrektur sind grundsätzlich
beibehalten; neue Arbeit betraf Reaktionsfähigkeit und Bedienung.

## Browserbeschränkungen

- Der Download-Hauptordner kann beim umfassenden Ordnerzugriff von Chrome gesperrt
  werden. Unterordner wie `Downloads/S2D` wählen oder einzelne Dateien speichern.
  Die App ändert keine Betriebssystemrechte und kann diese Schutzregel nicht aufheben.
- System-Teilen/Downloads verraten der App den endgültigen Zielpfad nicht; daraus
  darf keine Ordnerregel erfunden werden.
- Android-/Browser-Ordnerberechtigungen lassen sich nicht durch JSON auf andere
  Geräte übertragen. Gespeicherte Regeln und tatsächliche Zugriffe unterscheiden.
- Live-Rahmen nur innerhalb der Web-Kamera, nicht in einer externen Systemkamera.
- Browser-Zurück lässt sich nicht absolut blockieren. Entwurfssicherung bleibt
  die Absicherung gegen Schließen, Speicherbereinigung und geänderte Datei-Origin.

## Aufbau und Fortsetzung

- `s2d/template.html`: Oberfläche, CSS, bestehendes Icon und Lizenzen.
- `s2d/app.js`: Dokumentverwaltung, Kamera, OCR, Bearbeitung, Export, Persistenz.
- `s2d/extras.js`: Worker-Anbindung, Änderungsschlange, Lupe, Detailansicht,
  Sortiergesten, Speicherentscheidung.
- `s2d/image-worker.js`: Bildverarbeitung mit OffscreenCanvas und OpenCV.
- `s2d/vision.js`, `metadata.js`: erhaltene Geometrie/Farbkorrektur und Metadatenregeln.
- `s2d/assets.json`, `opencv.js`, `tesseract.js`, `pdf-lib.js`: eingebettete Bibliotheken
  und Modelle, keine Netzabhängigkeit zur Laufzeit.
- `s2d/build.mjs`: Build mit Node.js; aus dem Projektverzeichnis starten.
- `s2d/qa`: reproduzierbare Tests und ausschließlich synthetisches Testbild.
- Separat gelieferte `.bundle`: vollständiger lokaler Git-Verlauf.

Weitere Dateien: `s2d/build-web.mjs`, `s2d/pwa/offline-worker.js`,
`offline-client.js`, Icon-PNGs; `s2d/WEB_BUILD.json` dokumentiert Dateien und Prüfsummen.
`web/` und `dist/` sind generierte Ausgaben. Quellpaket separat vom Web-Uploadpaket
liefern, um doppelte große Bibliothekskopien zu vermeiden. Build mit Node.js ohne
Paketdownload: `node s2d/build.mjs` und `node s2d/build-web.mjs` aus dem Projektordner.
Webtests: `S2D_TEST_WEB=1 node s2d/qa/integration.cjs`,
`S2D_TEST_WEB=1 node s2d/qa/ocr-offline.cjs`, `node s2d/qa/offline.cjs` und
`node s2d/qa/offline-client.cjs`. Browseradapter sind keine Browserprüfung.

Nächster Schritt: Erstbefüllung committen/pushen und tatsächliche Pages-Bereitstellung
unter dem vom Nutzer benannten Repository prüfen. Erfolg erst nach HTTP-/Dateiprüfung
behaupten; bei fehlgeschlagenem Push die vorbereiteten lokalen Änderungen behalten. Anschließend tatsächlicher
S23-Flugmodus-Test nach vollständiger Offlineinstallation. Bestehende lokale
Dokumente vorher sichern und in den neuen Ursprung importieren.

Nächste Rückmeldung des Nutzers zum S23 zuerst auswerten. Insbesondere reale
Touch-Sortierung, Lupe, Viewporthöhe, Offline-Worker unter file:// und OCR-Laufzeit.
Vor weiteren Änderungen den aktuellen Stand und dieses Dokument lesen.

## Betrieb des veröffentlichten Repositorys

- Veröffentlichung aus `main` und Repositorywurzel; relative Pfade unterstützen
  den tatsächlichen Unterpfad `/scan2doc.app/` ohne Änderung des Programmcodes.
- `node s2d/build-web.mjs` erzeugt eine neue `web/`-Ausgabe. Vor Veröffentlichung
  deren in `s2d/WEB_BUILD.json` aufgeführte `deployFiles` in die Repositorywurzel
  übernehmen und gemeinsam committen. Alte Assetpfade aktiver Fassungen erhalten.
- `downloads/` wird nicht vom Offline-Worker gecacht; die eingebettete Standalone
  ist ein separater Download und braucht keinen Server im Betrieb.
- Branchänderungen nur als Fast-Forward; keine fremden Commits überschreiben.

## Blockierter Upload – bestätigte Diagnose

Die Erstbefüllung ist lokal als Commit `68fc4fa` vorbereitet. Direkter Git-Push
scheiterte ohne verfügbare HTTPS-Anmeldung. Der anschließende native GitHub-
Blob-Upload wurde mit HTTP 403 `Resource not accessible by integration` abgewiesen.
Es wurde keine Branchreferenz verändert und keine App-Datei extern veröffentlicht.

Die Installation `162305657` für `andreas-nigl` verwendet `repository_selection:
selected`. Die zugängliche Repositoryliste umfasst sechs bisherige Projekte,
aber nicht `scan2doc.app`. Öffentliche Metadaten waren trotzdem lesbar; die dort
angezeigte Benutzerberechtigung `push/admin` belegt keinen wirksamen Schreibzugriff
der Integration. Die frühere Aussage „mit Schreibzugriff erreichbar“ war deshalb
nicht ausreichend geprüft. Keine weiteren Schreibwege versuchen, bevor der Nutzer
das neue Repository für die bestehende Installation freigegeben hat.

Konfigurationsadresse: https://github.com/settings/installations/162305657
Unter Repository access das neue Repository ergänzen und Save. Danach Installation
und Branchkopf frisch lesen. Vorbereiteten Stand nur als Fast-Forward veröffentlichen.
Für große Dateien ist ein längengeprüfter Base64-Transfer in 196608-Byte-Blöcken
über exec_command und native create_blob möglich; bisher nur Dateilesen erfolgreich,
Blob-Schreibfreigabe wegen 403 noch nicht bestätigt. Git-SHA jeder erstellten Blob
gegen lokale git-ls-tree-Liste prüfen. Alle Blob-/Tree-/Commit-Schritte vor finaler
Branchänderung bündeln; keine Benutzeränderungen überschreiben.

## Freigabe der Integration und Browser-Uploadgrenze

Am 27.10.2026 erscheint `scan2doc.app` in der zugänglichen Repositoryliste. Ein
nativer Blob-Schreibtest ist erfolgreich. Der frühere 403-Block ist aufgehoben.
Die vom Nutzer gemeldete Browser-Commitfehlermeldung passt zur Standalone mit
26.873.449 Byte (ca. 25,6 MiB): GitHub-Webuploads sind auf 25 MiB je Datei begrenzt.
Reguläre Git-Dateien dürfen bis 100 MiB groß sein. Quelle:
https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github

Die Erstveröffentlichung erfolgt deshalb über native Blob-/Tree-/Commit-Operationen
mit geprüften Git-SHAs und abschließender Fast-Forward-Änderung von `main`.
App-Build bleibt `bf0f3cc571d924da`; Oberfläche, Dokumentverarbeitung und Offline-
Logik sind unverändert. Erneute Funktionstests sind wegen reiner Dateiübertragung
nicht erforderlich; maßgeblich ist der Bytevergleich aller veröffentlichten
App-Dateien sowie der Standalone mit den vorhandenen Build-Prüfsummen.
Ein erfolgreicher Browser- oder Android-Test wird dadurch nicht behauptet.

## Zweite Übertragungsgrenze – offene Einzeldatei

Der MCP-Transport weist Anfragen über 16 MiB mit HTTP 400 zurück. Dies ist keine
fehlende Repositoryberechtigung. OpenCV (13.298.870 Byte) wächst in Base64 über
diese Grenze; UTF-8-Übertragung wäre wegen JSON-Escapes sogar größer. Die 26,9-MB-
Standalone wird deshalb auf GitHub als ZIP angeboten; darin bleibt die HTML exakt
unverändert. Kein Umbau der funktionierenden Bildverarbeitung nur wegen Transport.

Die übrigen Blobs sind größtenteils bereits übertragen und anhand ihrer Git-SHAs
verifiziert, aber noch nicht durch eine Branchänderung veröffentlicht.
Die benötigte OpenCV-Datei hat Git-SHA `53bb331c4d8a3059d2c77aba79c4dd8191e8a8ed`.
Der Nutzer soll sie einmal per Browser als `opencv.js` in die Repositorywurzel
hochladen (13,3 MB, unter der Browsergrenze). Danach den neuen Branchkopf und
Blob-SHA prüfen, denselben Blob in `s2d/opencv.js` und dem aktuellen Web-Assetpfad
referenzieren und die temporäre Rootkopie in diesem Commit entfernen. Unbekannte
Dateien und andere Nutzeränderungen erhalten. Nicht ohne die Bibliothek veröffentlichen.

Arbeitsbereichweite Statusdateien: `scan-upload-manifest.json` enthält Dateipfade,
Modi, Größen und Git-SHAs. Die begonnene Sitzung hält bestätigte Blob-SHAs in
`scanUploaded`; vor Kontextwechsel in eine lokale JSON-Datei schreiben. Kein
Schlüssel und keine Anmeldedaten in diesen Statusdateien. Nach Dateiumbenennung
und Dokumentationsänderungen das Manifest aus dem aktuellen Git-Tree neu erzeugen.

## Manueller OpenCV-Upload bestätigt

Die vom Nutzer hochgeladene Rootdatei `opencv.js` wurde im Branchkopf
`0ab7d012361c73e607ceb2b8fb877c24d158c46c` geprüft: 13.298.870 Byte,
Git-SHA `53bb331c4d8a3059d2c77aba79c4dd8191e8a8ed`, exakt die erwartete Bibliothek.
Alle übrigen aktuellen Dateiblobs sind gemäß `scan-upload-ledger.json` übertragen
und SHA-geprüft. Die vollständige Erstveröffentlichung referenziert diese Blobs
in einem Tree auf Basis dieses Nutzercommits und erhält damit dessen Verlauf.
OpenCV liegt danach in `s2d/opencv.js` sowie im Assetordner; die temporäre Rootkopie
entfällt. Die unveränderte Standalone ist als ZIP im Downloadordner vorhanden.
Danach sind Pages-Bereitstellung und alle 17 tatsächlichen HTTP-Ressourcen zu prüfen.


## Veröffentlichung abgeschlossen und geprüft – 28.10.2026

Veröffentlichungscommit: `f0dc8c411878a9485d91eb3fbcef2368d8a92f54`.
Er erhält den manuellen Nutzerupload als Elterncommit. OpenCV liegt in
`s2d/opencv.js` (Quellbibliothek) und
`assets/bf0f3cc571d924da/opencv.js` (ausgelieferte Webbibliothek).
Die temporäre `opencv.js` in der Repositorywurzel wurde entfernt. Beide
Bibliothekspfade referenzieren denselben geprüften Git-Blob.

GitHub-Pages-Lauf 40563178951 ist erfolgreich abgeschlossen:
https://github.com/andreas-nigl/scan2doc.app/actions/runs/40563178951

Die öffentliche App https://andreas-nigl.github.io/scan2doc.app/ liefert HTTP 200.
Alle 17 Offline-Ressourcen, der Offline-Worker und der Standalone-ZIP-Download
wurden vollständig über HTTP heruntergeladen und gegen lokale Größen und
SHA-256 geprüft: 19 erfolgreiche Ressourcen, insgesamt 33.102.504 Byte.
Auch der unveränderte Inhalt der HTML im ZIP wurde geprüft (CRC und SHA-256).
Bericht: `s2d/qa/http-deployment.json`. Build bleibt `bf0f3cc571d924da`.

Standalone-Download:
https://andreas-nigl.github.io/scan2doc.app/downloads/261027_1646_s2d.zip

Ein echter Cloud-Browser zeigte nach dem Start „Bildverarbeitung bereit · OCR
lokal“ und „Offline bereit · Kamera, OCR und Export lokal verfügbar“.
Der anschließende Browser-Bildimporttest wurde abgebrochen und ist nicht als
bestanden zu werten. Eine vollständig netzgetrennte Browserprüfung sowie Tests
auf dem Android-Gerät (Kamera, Speicher, Gesten und Flugmodus) stehen aus.
Vorhandene automatisierte Funktions- und Workerprüfungen bleiben gültig; ihre
Simulationen werden dadurch nicht zu einem vollständigen Gerätetest.

Beim ersten Online-Aufruf auf „Offline bereit“ warten. Dokumente und Entwürfe
bleiben im jeweiligen Browserspeicher. Löschung oder Verdrängung von Browserdaten
kann sie entfernen; lokale Exporte und Datensicherungen bleiben erforderlich.
Keine privaten Scans oder Regeln wurden ins Repository übernommen.
