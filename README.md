# scan2doc.app · S2D

S2D wird aus derselben Quelle als Standalone und als öffentliche Offline-Web-App erzeugt.
Die separat gelieferte Standalone-HTML kann direkt im Browser geöffnet werden.
Das Web-Uploadpaket gehört auf einen HTTPS-Host; Einrichtung in `GITHUB_SETUP.md`.
Alle Bibliotheken und Sprachdaten sind eingebettet. Keine Installation, keine
API-Schlüssel, kein Upload der Dokumente.

Vor dem Wechsel aus einer alten App-Version dort **Dokumente sichern** verwenden.
Falls die neue HTML die alten Entwürfe nicht sieht: **Sicherung einlesen**.

Die maßgebliche Übergabe, Änderungen und Prüfgrenzen stehen in
`PROJECT_HANDOFF.md`. Die App ist eine unverschlüsselte Testversion.

## Für die Weiterentwicklung

Node.js 20 oder neuer. Im entpackten Projektverzeichnis `node s2d/build.mjs`
ausführen. Ausgabe: `dist/YYMMDD_HHMM_s2d.html`, Zeit Europe/Berlin.
Die eingebetteten Bibliotheken brauchen zum Build keinen Paketdownload.

Die Integrationstests brauchen zusätzlich `@napi-rs/canvas`. Der absolute Pfad
zum verwendeten `node_modules`-Verzeichnis wird über
`CODEX_PRIMARY_RUNTIME_NODE_MODULES` gesetzt. Danach:

- `node s2d/qa/integration.cjs`
- `node s2d/qa/ocr-offline.cjs`

Die Tests verwenden eine simulierte Oberfläche und ersetzen keinen Gerätetest.
Der Git-Verlauf wird zusätzlich als `.bundle` bereitgestellt und kann mit Git geklont werden.

## Webfassung und Offlinebetrieb

`node s2d/build-web.mjs` erzeugt `web/index.html`, versionierte Ressourcen,
Manifest und Service Worker. Keine Paketinstallation nötig. Keine Scans im Webpaket.
Alle Funktionen verarbeiten Daten lokal; keine Gerätesynchronisierung.
Beim ersten Onlineaufruf auf „Offline bereit“ warten. Dann kann die installierte
App auch ohne Netz gestartet werden. Browser- und Ordnerbeschränkungen bleiben bestehen.

Zusätzliche Prüfungen: `S2D_TEST_WEB=1 node s2d/qa/integration.cjs`,
`S2D_TEST_WEB=1 node s2d/qa/ocr-offline.cjs`, `node s2d/qa/offline.cjs`,
`node s2d/qa/offline-client.cjs`. Laufzeitadapter sind keine echte Browserprüfung.

## Veröffentlichung

Öffentliches Repository: https://github.com/andreas-nigl/scan2doc.app
GitHub Pages veröffentlicht die Dateien aus `main` und `/(root)`. Die App-Daten
bleiben ausschließlich im Browser. Die aktuelle Standalone steht im Ordner
`downloads`; Browserdaten und Dokumente sind nicht Teil des Repositorys.
