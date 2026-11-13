# Werkheft – private Schraubergarage

Eigenständiger werbefreier Nachbau der Garage-Funktionen, mit dunkler Werkstatt-/Autoradio-Oberfläche. **Auf ausdrücklichen Nutzerwunsch keine Logins, Konten, Passwörter, Bezahlmodelle oder Registrierung.** Alle Geräte im freigegebenen Heimnetz benutzen dasselbe Heft.

## Laufender Docker-Betrieb

- Host: **docker01**, Proxmox VM 300, **192.168.178.230**.
- Heimnetz-Link: **https://werkheft.drydev.eu** (Caddy + AdGuard-Rewrite, nur intern auflösbar), direkt: http://192.168.178.230:4177.
- Container: `werkheft`, Neustartregel `unless-stopped`.
- Compose: `/opt/homelab/stacks/werkheft/compose.yaml` auf docker01.
- Quellcode im Stack: `/opt/homelab/stacks/werkheft/app`.
- Dauerhafte Daten: `/srv/werkheft/data/werkheft.sqlite` einschließlich SQLite-WAL und -SHM im Betrieb.
- Healthcheck: `/healthz`.
- Interne Domain über Caddy (Wildcard-Zertifikat) und AdGuard-DNS-Rewrite; kein Tunnel und keine Internetfreigabe.

Docker läuft als UID/GID 1000, ohne Linux-Capabilities, mit schreibgeschütztem Root-Dateisystem. Nur `/data` ist dauerhaft schreibbar. Veröffentlicht ist ausschließlich `192.168.178.230:4177`, nicht alle Host-Schnittstellen. Die Anwendung akzeptiert nur erlaubte Hostnamen und private Quelladressen; Origin-/Cross-Site-Schutz bleibt aktiv.

**Wichtig:** Ohne Login kann jeder, der den Heimnetz-Link erreichen kann, Daten lesen und bearbeiten. Nicht ins Internet weiterleiten. HTTP verschlüsselt nicht. Dies ist bewusst eine private gemeinsame Anwendung und kein öffentlich betreibbarer Mehrbenutzer-Dienst.

## Enthaltene Funktionen

- Fahrzeuge: dreistufige Anlage, Foto, VIN, HSN/TSN, Erstzulassung, Motor-/Getriebecode, Reifen, Öl, HU, Besitzer-Nummer und reversible Archivierung.
- Chronik: Arbeiten mit Datum, Kilometerstand, Freitext, Kategorie, Kosten, Ausführendem, Erfassungszeit und sichtbarem Änderungsverlauf.
- Kilometerstände: neue und historische Ablesungen mit getrenntem Ablese-/Erfassungsdatum, Plausibilitätsprüfung und begründeten Berichtigungen; eigener Stände-Reiter.
- Termine: Fälligkeit nach Datum oder Kilometerstand, HU-Hinweise im Heft, Routinen und atomare Übernahme einer erledigten Arbeit mit Folgetermin.
- ICS-Kalenderexport für datierte Aufgaben; korrekte Maskierung und Zeilenfaltung.
- Tankbuch mit Voll- und Teilfüllungen, Verbrauch aus Volltankintervallen, Preisübersicht, Diagramm und CSV.
- Buchhaltung aus Tankungen, Arbeiten und weiteren Ausgaben, Fahrzeug-/Zeitraumfilter, Diagramm und CSV.
- Regal: eigene auch leere Kisten, Umbenennen, Einfärben, Reihenfolge, Drag-and-drop, eigene unveränderte Links, Teile-/Werkzeugbestand, Einkaufsliste, Duplizieren und Verschieben. Tastenschaltflächen als Alternative zum Ziehen.
- Nachweise: Bilder an Fahrzeug/Arbeit, lokale Verkleinerung und Neuberechnung vor Upload, manuelle dauerhaft in Pixel eingebrannte Schwärzung. Nur PNG/JPEG/WebP; PDFs vorher lokal als Bild exportieren.
- Vollbackup/Restore als JSON, mit Vorsicherungsdownload vor Import. Enthält auch Kisten, Ablesungen und Nachtfahrt-Bestenliste.
- Fahrzeug-Weitergabe als separate datensparsame Datei und Browser-Druck/PDF. Die eigene Kopie bleibt bestehen.
- Globale Suche, eigene allgemeine Checklisten und privates schwarzes Brett.
- **Nachtfahrt:** vier Fahrspuren, Gas/Bremse, Gegenverkehr, Ölkannen, Kollisionen, Zeitlimit, Touch-/Tastatursteuerung, serverseitige deterministische Nachrechnung und dauerhafte Monats-Bestenliste je frei gewähltem Fahrername. Keine geschützten Spieleridentitäten und kein Anspruch auf fälschungssicheren Wettkampf.
- Zusätzlich Werkzeug-Memory, Reaktion und Quiz; deren Bestwerte bleiben browserlokal.
- Keine Werbung, Tracker, Affiliate-Umschreibungen, Fremdskripte oder extern geladenen Schriftdateien.

## Bewusst nicht Teil der privaten Seite

Konten, Registrierung, E-Mail-Verifikation, Freunde-Werbung, Chat zwischen Online-Konten, ein öffentlicher fremder Marktplatz, Abos, Zahlungen und gesponserte Gewinnspiele sind für diese private Seite ausdrücklich nicht vorgesehen. Das schwarze Brett ist privat; die Weitergabe erfolgt per Datei, nicht über eine zentrale Eigentumsdatenbank.

Kein Push-/Maildienst und keine vollständige Offline-Bearbeitung. Erinnerungen erscheinen im Auftragsbuch; datierte Aufgaben können in den eigenen Kalender importiert werden. Das App-Manifest ist vorhanden, Installation und Browser-Berechtigungen hängen von Browser und sicherem Kontext ab.

Die eigenen allgemeinen Checklisten ersetzen keine fahrzeugspezifischen Reparaturunterlagen. Keine Behauptung einer identischen Übernahme der 30 Original-Anleitungstexte oder der internen Serverarchitektur. Nachtfahrt ist eine eigene Implementierung des beobachteten Spielprinzips, kein kopierter Original-Quellcode.

## Lokal starten

Node.js >=22.13 mit `node:sqlite` genügt; keine Laufzeitpakete:

```sh
cd /root/Projects/Werkheft
npm start
```

Standard: http://127.0.0.1:4177, nur auf dem lokalen Rechner.

Netzwerkbetrieb wird nur mit `WERKHEFT_PRIVATE_LAN=1` und einer expliziten Host-Allowlist freigegeben. In Docker setzt die Compose-Datei diese Werte. Es gibt absichtlich keine automatische öffentliche Freigabe.

## Aktualisieren und verwalten

```sh
ssh lndr@192.168.178.230
cd /opt/homelab/stacks/werkheft
sudo docker compose ps
sudo docker compose logs --tail 30
sudo docker compose up -d --build
```

Die Deployment-Datei liegt zusätzlich unter `deploy/compose.yaml`. Vor Updates an Datenmodellen eine vollständige JSON-Sicherung über die Oberfläche herunterladen. Die SQLite-Datei niemals durch eine Demo-/Testdatenbank ersetzen.

## Datensicherheit und Grenzen

Änderungen und Entfernungen bleiben im lokalen Audit, einschließlich vorheriger Bildstände. Nachträgliches Schwärzen oder Löschen entfernt frühere Uploads nicht aus Audit oder Sicherungen. Das Originalbild wird vor dem erstmaligen Upload durch ein neu gerendertes Bild ersetzt; sensible Pixel müssen vom Nutzer vorher markiert werden.

Protokolle sind nicht kryptografisch signiert oder manipulationssicher. Der PDF-Ausdruck enthält die aktuellen Werte und Revisionsnummern, nicht alle alten Werte. Eine Bearbeitung alter Arbeiten verändert zugehörige Termine nicht automatisch.

Die Übergabedatei enthält technische Stammdaten und Serviceeinträge, aber keine Tankungen, Kostenbeträge, Bilder, privaten Fahrzeugnotizen oder Regalinhalte. **Service-Freitext wird mitgegeben** und muss vorher auf private Angaben geprüft werden.

JSON-/Importlimit 64 MB. Einzelne Eingabebilder max. 15 MB, vor dem Upload auf max. 1600 Pixel verkleinert. Bei großer Bildsammlung kann der Gesamtbackup-Import das Limit überschreiten: dann die Datenbank bei gestopptem Container konsistent sichern. Für Dateisicherungen den Container vorher stoppen oder eine SQLite-konsistente Backup-Methode verwenden; nicht nur eine aktive DB ohne WAL kopieren.

## Tests

```sh
npm install
npm test
npm run test:e2e
```

Der E2E-Test verwendet `CHROMIUM_PATH`, einen bekannten lokalen Chromium oder Playwrights Browserpfad. Falls nötig vorher `npx playwright install chromium`.

Tests laufen mit flüchtigen Datenbanken, nicht gegen Nutzerdaten. Geprüft werden u. a. Persistenz, Validierung, atomare Routinen, Sicherung/Import, privater LAN-Betrieb, Kisten, historische Ablesungen, Nachtfahrt-Replay, Desktop-/Mobil-UI, Schwärzung auf Pixelebene und PDF. Screenshots unter `test-results/`.

## Dateien

- `server.mjs`: HTTP, private LAN-Freigabe und API.
- `lib/`: Validierung, SQLite, Audit, Import/Export und Rennwertung.
- `public/`: Oberfläche ohne Buildschritt; `race-engine.js` wird vom Browser und Server gemeinsam verwendet.
- `Dockerfile`, `deploy/compose.yaml`: Betrieb.

Schrift Nimbus Sans Narrow aus URW Base35, Lizenz unter `public/fonts/LICENSE.txt`. Originalmarke und Originalcode gehören ihren Rechteinhabern. Die neue private Anwendung heißt Werkheft.
