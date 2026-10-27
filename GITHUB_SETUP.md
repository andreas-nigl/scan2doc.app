# S2D online und offline – Einrichtung

Stand: 27.10.2026. Der Nutzer hat das öffentliche Repository
`andreas-nigl/scan2doc.app` angelegt und GitHub Pages aktiviert.

## Repository und Veröffentlichung

- Repository: https://github.com/andreas-nigl/scan2doc.app
- Branch: `main`, Veröffentlichungsordner: `/(root)`.
- Unter **Settings → Pages** zeigt GitHub nach erfolgreichem Build den **Visit site**-Link.
- Beim ersten Befüllen enthielt das Repository nur eine README. Die App ist erst
  erreichbar, nachdem `index.html`, `assets`, Manifest und Offline-Worker hochgeladen
  und GitHub Pages erfolgreich bereitgestellt wurden.
- Die versionierte Standalone liegt unter `downloads/261027_1646_s2d.zip` und
  kann zum lokalen Öffnen heruntergeladen werden.

Die aktuelle Oberfläche und alle Ressourcen verarbeiten Dokumente lokal.
Ein Public-Repository macht die Programmdateien sichtbar. Es enthält keine
persönlichen Dokumente oder vom Nutzer exportierten Datensicherungen.

## 4. Auf dem Handy offline bereitstellen

1. Den veröffentlichten HTTPS-Link direkt in Chrome öffnen, nicht als eingebettete
   Vorschau und nicht als `content://`-Datei.
2. Den Bereich **App und Offlinebetrieb** beachten. Beim ersten Laden werden ca.
   23,8 MB (22,7 MiB) App-Dateien einschließlich deutscher und englischer OCR geladen.
3. Erst bei **Offline bereit** ist der vollständige Offline-Start bestätigt.
4. **App installieren** verwenden, sobald Chrome den Button freigibt; alternativ
   im Browsermenü installieren beziehungsweise zum Startbildschirm hinzufügen.
5. Für die Kamera die Kameraberechtigung erteilen. Dann Flugmodus einschalten,
   App vollständig schließen, über das App-Icon neu öffnen und ein Dokument
   aufnehmen, bearbeiten, erkennen und exportieren.

Die Offlineinstallation braucht einmal Internet. Danach benötigen Scan,
Bildverarbeitung, OCR und Export selbst keine Verbindung. Ein Export zu einem
externen Cloud-Speicher kann trotzdem eine Verbindung benötigen.

## Dokumente und bestehende Entwürfe

- In der alten lokalen HTML **Dokumente sichern** verwenden und diese Sicherung
  in der Online-App mit **Sicherung einlesen** übernehmen. Eine lokale HTML und
  eine HTTPS-Seite haben getrennte Browserspeicher.
- Scans, OCR-Texte, Dateinamen und Ordnerzuordnungen werden lokal im jeweiligen
  Browser gespeichert. Diese Version synchronisiert sie nicht zwischen Geräten.
- JSON-Exporte mit persönlichen Daten und Dokumentbilder niemals in dieses
  öffentliche Repository hochladen. Das bereitgestellte Webpaket enthält keine Scans.
- **Lokalen Speicher schützen** fragt beständigen Browserspeicher an. Eine Zusage
  hängt vom Browser ab und ersetzt keine Sicherung. Löschen der Browserdaten oder
  Speicherbereinigung kann die Offlinekopie und lokale Entwürfe entfernen.
- Updates verändern den Datenbanknamen und die bestehenden Sicherungsformate nicht.

## Updates

**Nach Updates suchen** prüft eine neue Programmfassung. Sie wird vollständig
heruntergeladen und auf Dateigröße und SHA-256 geprüft. Bei fehlenden oder
abweichenden Dateien wird sie nicht freigegeben. Die bisherige Fassung bleibt nutzbar.

Eine neue Version ersetzt keinen laufenden Editor. Bei **Neue Version bereit**
alle S2D-Fenster schließen und anschließend neu öffnen. Persönliche Entwürfe bleiben
in der lokalen Datenbank. Die neue Fassung löscht keine Dokumentdaten.

## Was HTTPS verbessert – und was weiterhin begrenzt ist

- Web-Kamera, Kameravorschau und darin eingeblendete Dokumentkanten können unter
  einer regulären HTTPS-Adresse arbeiten, sofern Browser und Gerät sie unterstützen.
  Offline behält die installierte App ihren sicheren Ursprung.
- Ein Live-Rahmen kann nur in der eigenen Web-Kamera angezeigt werden, nicht in
  einem separat geöffneten Systemkamera-Fenster.
- Insbesondere Android-Chrome bietet nicht dieselben frei wählbaren Ordnerzugriffe
  wie Desktop-Chrome. Die App prüft die verfügbaren Funktionen und nutzt ansonsten
  Teilen beziehungsweise Download. HTTPS hebt Browser-Schutzregeln nicht auf.
- Die bisherige Android-Speicherwarnung ist damit nicht als behoben nachgewiesen.
  Die Onlinefassung vermeidet große eingebettete Skripte und Base64-Sprachdaten im
  Hauptdokument; der tatsächliche RAM-Bedarf muss am Gerät geprüft werden.
- Die Testversion enthält keinen neuen Passwortschutz und keine Verschlüsselung
  lokaler Entwürfe. Öffentlich bereitgestellt wird das Programm. Verschlüsselte
  Sicherungen oder Anmeldung wären ein eigener, zusätzlich zu prüfender Ausbau.

## GitHub Pages oder ChatGPT Sites?

| Anforderung | GitHub Pages | ChatGPT Sites |
|---|---|---|
| Lokaler Scanner mit HTTPS | Geeignet | Ebenfalls geeignet |
| Offlinebetrieb | Service Worker und lokale Daten | Ebenfalls ausdrücklich umzusetzen |
| Lokale OCR ohne Server | Möglich | Möglich, benötigt keine Serverfunktion |
| Anmeldung und eigene Serverlogik | Benötigt zusätzlichen Dienst | Unterstützter Ausbaupfad |
| Gerätesynchronisierung und Cloud-Dateien | Benötigt zusätzlichen Dienst | Datenbank und Dateispeicher können angebunden werden |

Empfehlung für den aktuellen Stand: **GitHub Pages und PWA**. Ein Backend bringt
für rein lokale Scans keinen notwendigen Vorteil. ChatGPT Sites wäre sinnvoll,
wenn später bewusst eine Anmeldung oder geräteübergreifende Synchronisierung
hinzukommt; diese Serverfunktionen benötigen bei der Nutzung eine Verbindung.

## Tatsächlich geprüfter Stand

Die versionierte Projektquelle `PROJECT_HANDOFF.md` dokumentiert die Prüfungen.
Die App- und Offlineprüfungen verwenden eine simulierte Browserumgebung, echten
OpenCV-Code, echte OCR-Sprachdaten, echte Dateiinhalte und echte SHA-256-Prüfungen.
Ein echter Android-Kamera-/Flugmodus-Test und eine Prüfung des veröffentlichten
GitHub-Links sind noch offen. Kein nachgewiesener Qualitätsgleichstand mit Adobe Scan.

Offizielle Referenzen:

- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
