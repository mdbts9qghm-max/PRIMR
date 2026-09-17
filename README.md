# PRIMR

Eine App für Training, Schlaf und tägliche Aufgaben im Wechselschichtdienst.
Sie läuft als PWA im Browser, speichert alles lokal auf dem Gerät und braucht
weder Server noch Konto.

## Starten

```bash
npm start          # dann http://localhost:8080 öffnen
npm test           # Rechenkerne und Auslieferung, ohne Browser
npm run test:update  # Aktualisierungspfad im Browser (braucht npm start + playwright)
```

Auf dem iPhone in Safari öffnen und über *Teilen → Zum Home-Bildschirm* ablegen.
Danach startet sie im Vollbild und funktioniert offline.

## Die fünf Tabs

**Heute** – Datum, Dienst und die Position im Fünferblock, dann der Tag als
Zeitstrahl: Dienst, Trainingsfenster und Schlaf nebeneinander, mit einer
Markierung für die aktuelle Uhrzeit. Darunter die WHOOP-Werte und daraus die
Bereitschaft von 0 bis 100 mit ihrem Verlauf. Hinter „Auswirkungen auf Tag und
Training“ steht, welcher Wert wie stark eingeflossen ist und was das konkret
für heute bedeutet.

Dann kommt **das Training des Coaches** – dieselbe Einheit, die im Wochenplan
steht, mit Phase, Countdown und dem Hinweis, wenn es die Schlüsseleinheit der
Woche ist. Hat die Bereitschaft sie verändert, steht die ursprüngliche Planung
daneben, und der Wochenplan markiert den Tag als *angepasst*: Beide Ansichten
sagen über denselben Tag immer dasselbe. Darunter ein Blick auf morgen – ob
dort etwas Hartes ansteht, entscheidet mit, was heute Abend noch geht – und
zuletzt die Aufgaben.

**Training** – der Wochenrhythmus als Streifen (Dienst, Belastung, Art der
Einheit, harte Tage markiert), darunter der Wochenplan im Detail, die
Zonenverteilung, die Progression und die Vorbelastung der letzten 28 Tage.

**Aufgaben** – ein Raster aus Gewohnheit × Tag über zwei Dienstblöcke, mit dem
Dienst als Kopfzeile: So sieht man, an welchen Schichttagen Gewohnheiten reißen.
Dazu eigene Aufgaben, die einmalig, täglich, an festen Wochentagen oder an
bestimmten Schichttagen stehen können.

**Schlaf** – derselbe Zeitstrahl in groß, das Schlaffenster für heute, Abend-
und Morgenroutine passend zum Diensttag, Schlafdauer der letzten 14 Tage und die
Fenster der nächsten Woche.

**Werte** – VO2max, Schwellenherzfrequenz, Ruhepuls, HRV und
Herzfrequenzerholung nach einer Minute im Verlauf.

## Das Schichtmodell

Der Dienstplan läuft in einem Fünferblock, siebenmal wiederholt – das ergibt die
35 Tage des Zyklus:

```
T   N   Ü   DF  DF     T   N   Ü   DF  DF     …  (7 ×)
```

Gespeichert wird nur, ob ein Tag Tagschicht (`T`), Nachtschicht (`N`) oder
dienstfrei (`F`) ist. Ü und die Unterscheidung der beiden DF-Tage ergeben sich
aus der Lage im Block:

| Tagtyp | Erkannt an | Schlaf davor | Schlaf danach |
|---|---|---|---|
| T · Tagschicht | `T` | 7,5 h (22:00 – 05:30) | 23:30 – 08:00 |
| N · Nachtschicht | `N` | 8,5 h (23:30 – 08:00) | ab 08:00, dazu Vorschlaf 15:00–17:30 |
| Ü · nach der Nacht | frei direkt nach `N` | 6 h (08:00 – 14:00) | ab 00:00, 8 h |
| DF · erster freier Tag | frei, nächster Tag nicht `T` | 8 h (00:00 – 08:00) | 23:30 – 08:00 |
| DF · vor der Tagschicht | frei, nächster Tag ist `T` | 8,5 h (23:30 – 08:00) | 22:00 – 05:30 |

Die App unterscheidet dabei streng zwischen **Schlaf davor** – der Nacht, die
heute früh geendet hat und die WHOOP beim Check-in meldet – und **Schlaf
danach**, dem Fenster, das heute Abend beginnt. Nur der erste Wert ist der
Maßstab für die Bereitschaft von heute. Am Ü-Tag sind das sechs Stunden, nicht
die vierzehn, die über den ganzen Tag verteilt zusammenkommen.

Eingerichtet wird das mit einem einzigen Tipp: unter *Einstellungen →
Schichtplan* auswählen, welchen Dienst man heute hat. Damit liegt der ganze
Zyklus auf dem Kalender. Der 35-Tage-Raster lässt sich dort auch von Hand
ändern, falls sich der Dienstplan grundsätzlich ändert.

### Abwesenheiten und Zusatzdienste

Einzelne Tage lassen sich überschreiben, ohne den Zyklus zu verbiegen. Für
längere Zeiträume gibt es unter *Einstellungen → Schichtplan* ein Von-Bis-Feld,
für einzelne Tage den Weg über den Trainings-Tab: Tag öffnen, Dienst ändern.

| Eintrag | Wirkung |
|---|---|
| `U` Urlaub | Verhält sich in jeder Hinsicht wie ein dienstfreier Tag und durchläuft dieselbe Ableitung: Urlaub direkt vor einer Tagschicht bekommt die frühere Bettzeit, Urlaub direkt nach einer Nacht bleibt der Ü-Tag. |
| `K` Krank | Eigener Tagtyp. Kein Training, zehn Stunden Schlafsoll statt sechs, Mittagsschlaf, und eine Karte mit dem, was tatsächlich hilft. |
| `T` / `N` / `F` | Angeordneter Zusatzdienst, Tausch oder ein zusätzlich freier Tag. |

**Wiedereinstieg nach Krankheit.** Nach einem Infekt sofort wieder hart zu
trainieren ist der Fehler, der aus drei Krankheitstagen drei verlorene Wochen
macht. Die App hält deshalb für jeden Krankheitstag einen Tag ohne harte Reize
frei – mindestens zwei, höchstens sieben – und fährt den Umfang in dieser Zeit
gestaffelt von 45 % wieder hoch. Der Heute-Tab zeigt, an welchem Tag der Phase
du stehst und ab wann wieder normal geplant wird.

## Zielrennen

Ohne Ziel läuft der Plan endlos in Vierwochenblöcken weiter. Mit einem Ziel
(*Einstellungen → Zielrennen*) rechnet er vom Renntag rückwärts:

| Phase | Wochen vorher | Was passiert |
|---|---|---|
| Grundlage | ab 53 | Wochenumfang aufbauen, Höhenmeter langsam dazunehmen |
| Aufbau | 25–52 | Höhenmeter systematisch steigern, lange Einheiten in Stunden statt Kilometern, Power-Hiking üben |
| Spezifisch | 4–24 | Rennsimulation: Bergab-Toleranz, Nachtläufe, Verpflegung, Doppeltage |
| Taper | 1–3 | Umfang auf 40–75 %, Spannung halten |
| Rennwoche | 0 | Nur lockeres Laufen, dann das Rennen |
| Regeneration | danach | Vier Wochen ohne harte Reize, alles kurz |

### Was der Kalender verlangt und was der Körper trägt

Die Phasen setzen voraus, dass man mit der passenden Grundlage in ihnen
ankommt. Wer neun Monate vor einem 86-km-Berglauf bei 20 km pro Woche steht,
tut das nicht. Deshalb ist jede Wochenvorgabe **das Kleinere aus Phasenziel und
eigener Steigerung** – die Steigerung beginnt bei dem, was heute geht, und wächst
nie um mehr als zehn Prozent pro Woche.

Reicht die Zeit für den nötigen Umfang nicht aus, sagt die App das offen
(*Rennplan → Der Weg dorthin*) statt die Steigerung zu überdrehen.

### Höhenmeter ohne Berge vor der Tür

Als stärkste Woche dient rund 55 % der Renn-Höhenmeter. Sie entstehen aus
Wiederholungen am längsten erreichbaren Anstieg (*Einstellungen → Gelände*).
Das Wochenbudget wird an einer Stelle verteilt: Zuerst wird abgezogen, was
feststeht – eine Bergab-Einheit, wenn sie ansteht –, dann bekommt die
Bergeinheit ihren Anteil, sofern drei Wiederholungen zusammenkommen, und der
Rest verteilt sich auf die langen und lockeren Läufe.

### Die vier ultraspezifischen Inhalte

- **Höhenmeter** als eigene Einheit, sobald das Wochenziel drei Wiederholungen hergibt
- **Time on Feet** statt Kilometer, sobald die lange Einheit zwei Stunden überschreitet
- **Bergab-Belastungstoleranz** ab der Aufbauphase, alle zwei Wochen, mit langsam wachsender Wiederholungszahl. Die exzentrische Belastung im Quadrizeps ist der häufigste Grund für einen Abbruch bei dieser Distanz und der einzige Reiz, den man nicht kurzfristig nachholen kann.
- **Verpflegungsstrategie**, geübt in jeder langen Einheit ab der Aufbauphase, mit den Mengen des Rennplans

Dazu zwei Inhalte, die sich aus diesem Rennen ergeben: **Doppeltage** (zwei lange
Tage hintereinander erzeugen den Zustand der Stunden 14 bis 20, ohne 14 Stunden
am Stück zu laufen) und **Nachtläufe**, weil der Start um 23:00 Uhr liegt.

### Woran der Coach sich ausrichtet

Mit Ziel ändern sich nicht nur die Einheiten, sondern auch die Maßstäbe:

- **Intensitätsverteilung.** Ein Rennen über 19 Stunden läuft fast vollständig
  in Zone 1 und 2. Der Plan zielt deshalb auf 85–88 % locker, 10–13 % Schwelle
  und höchstens 3 % hart; die Zonenkarte vergleicht die geplante Woche direkt
  damit. **Zone 5 kommt mit Bergziel nicht mehr vor** – die Erholung, die eine
  solche Einheit kostet, fehlt danach bei der langen Einheit.
- **Steigrate statt Pace.** Aus 4295 hm und der angepeilten Zeit ergibt sich,
  wie viele Höhenmeter pro Stunde im Anstieg nötig sind. Diese Zahl lässt sich in
  den Bergwiederholungen direkt messen; eine Pace sagt im Gelände nichts.
- **Messgrößen.** Steigrate und HF-Drift im Longrun stehen im Werte-Tab ganz
  oben, VO2max bewusst weiter unten: Für diese Distanz entscheidet nicht die
  Obergrenze, sondern wie lange man darunter durchhält.
- **Kraft-Schwerpunkte.** Die Termine bleiben, die Ausrichtung wechselt:
  Bergab-Kraft statt schwerer Beintag, Rumpf und Zugkraft für Rucksack und
  Stöcke, Sprunggelenk und Einbeiniges für technisches Gelände. Übungen und
  Gewichte bleiben weiterhin deine Sache.
- **Schlüsseleinheiten werden verschoben, nicht gekürzt.** Reicht die
  Bereitschaft an einem Tag mit langer oder intensiver Einheit nicht, schlägt
  die App einen späteren freien Tag derselben Woche vor, statt den Reiz
  zusammenzustreichen.

## Wie der Trainingsplan entsteht

Ziel sind drei Läufe (einmal intensiv, einmal Longrun, einmal locker) und drei
Krafteinheiten pro Woche.

Beim Laufen gibt die App die Einheit vor – Struktur, Dauer und Zielzone. **Beim
Krafttraining plant sie nur den Termin**: welcher Tag, welcher Schwerpunkt
(Unterkörper, Oberkörper, Athletik) und wie viel Zeit das Fenster hergibt.
Übungen, Sätze und Gewichte bleiben deine Sache. Der Schwerpunkt steckt trotzdem
im Modell, weil davon abhängt, was am Folgetag noch sinnvoll ist: ein schwerer
Beintag blockiert den harten Lauf danach, Oberkörper nicht.

Der Planer durchsucht alle möglichen Verteilungen der sechs Einheiten auf die
sieben Tage vollständig und bewertet jede:

- An der Tagschicht ist kein Training möglich, höchstens Mobility.
- Der Longrun liegt bevorzugt an freien Tagen, sonst am Vormittag vor der Nacht.
- Zwei harte Einheiten an aufeinanderfolgenden Tagen kosten stark Punkte.
- Longrun und intensive Einheit werden auseinandergezogen.
- Eine Einheit muss in das Zeitfenster des Tages passen. Bei Krafteinheiten
  zählt die Anfahrt zum Gym doppelt mit; Läufe starten an der Haustür.
- An einem freien Tag dürfen zwei lockere Einheiten stehen (ein Lauf plus Kraft) –
  sonst gehen in Wochen mit zwei Tagschichten keine sechs Einheiten in fünf
  nutzbare Tage.

Weil der Suchraum vollständig durchlaufen wird, ist das Ergebnis reproduzierbar
und nicht das Ergebnis einer Faustregel.

### Progression

Der Laufumfang läuft in Vierwochenblöcken mit 100 %, 110 %, 120 % und 72 % des
Blockumfangs. Jeder neue Block startet 5 % über dem letzten, gedeckelt beim
2,6-fachen des Startumfangs. Der Plan hat kein Ende und kein Wettkampfziel –
gemessen wird an physiologischen Markern.

Die Kraftprogression steuerst du selbst. Beim Abhaken einer Krafteinheit fragt
die App, was du gemacht hast; daraus entsteht dein eigener Verlauf, ohne dass
sie dir Gewichte vorschreibt. Für die Belastungsrechnung setzt sie eine normale
Einheit an, nicht das ganze verfügbare Zeitfenster – deine Angabe zur
Anstrengung korrigiert das nach oben oder unten.

### Herzfrequenzzonen

| Zone | Bereich | Zweck |
|---|---|---|
| 1 | 114–138 | Regeneration |
| 2 | 139–160 | Grundlage |
| 3 | 161–175 | Schwelle |
| 4 | 176–190 | VO2max |
| 5 | 191–205 | Anaerob |

## Bereitschaft

Der Check-in fragt drei Werte ab – Recovery, Schlaf und HRV – plus das eigene
Muskelgefühl. Ruhepuls, Schlaf-Performance und Strain sind optional und machen
den Wert nur genauer.

Daraus wird ein Wert von 0 bis 100: Recovery (42 %), Schlaf-Performance (18 %),
Schlafdauer gegen das Soll des Tages (14 %), HRV (14 %), Ruhepuls (12 %) und
Muskelgefühl (10 %). Fehlende Werte werden nicht geschätzt, sondern aus der
Gewichtung herausgerechnet. HRV und Ruhepuls vergleicht die App gegen den
eigenen 14-Tage-Schnitt statt gegen Normwerte und lässt sie deshalb erst
einfließen, wenn dieser Schnitt existiert.

Dazu kommen Korrekturen: eine 7-Tage-Last deutlich über dem 28-Tage-Schnitt senkt
den Wert, eine ruhige Woche hebt ihn leicht, eine zweite Nacht in Folge kostet
Punkte. Das Lastverhältnis bleibt leer, solange weniger als zwölf Tage im
Logbuch stehen – vorher wäre es eine Einheit gegen lauter Nullen.

| Wert | Wirkung auf das Training |
|---|---|
| ab 75 | Plan unverändert, harte Reize erlaubt |
| 55–74 | Intensität bleibt, Umfang −15 %, Zone 5 gesperrt |
| 38–54 | kein harter Reiz, Umfang −40 %, Puls unter 160 |
| unter 38 | Regeneration statt Training |

## Aufbau

```
index.html            Hülle
css/app.css           Design-Tokens und Komponenten
js/core/              Rechenkerne, ohne DOM und ohne Browser testbar
  shift.js            35-Tage-Zyklus, Tagtypen und Zusatzdienste
  sleep.js            Schlaffenster und Routinen
  plan.js             Trainingsplaner und Progression
  library.js          Einheiten-Bibliothek
  readiness.js        Bereitschaft aus den WHOOP-Werten
  tasks.js            Aufgaben und Gewohnheiten
  store.js            Zustand im localStorage
  context.js          abgeleitete Tagesdaten für die Views
  timeline.js         der Tag als Zeitstrahl zwischen zwei Aufstehzeiten
js/ui/                DOM-Helfer, SVG-Diagramme, geteilte Bausteine
js/views/             die fünf Tabs und die Formulare
test/run.js           Tests der Rechenkerne
sw.js                 Offline-Betrieb
```

## Aktualisierung

Die App liefert über den Service Worker **zuerst aus dem Netz** und nur
ersatzweise aus dem Cache. Andersherum – so lief die erste Fassung – bleibt eine
einmal installierte App für immer auf dem Stand ihrer Installation stehen.

Vier Dinge gehören dazu, und alle vier sind nötig:

1. `fetch` im Service Worker läuft mit `cache: 'reload'`. Unter dem Worker liegt
   noch der HTTP-Cache des Browsers; ohne das liefert diese Ebene wieder die
   alte Datei aus.
2. Die Registrierung nutzt `updateViaCache: 'none'`, sonst speichert der Browser
   `sw.js` selbst zwischen und bemerkt eine neue Fassung tagelang nicht.
3. Der wartende Worker übernimmt **nicht** von selbst (kein `skipWaiting` im
   `install`). Wann übernommen wird, entscheidet die App: **beim Start still**,
   während der Nutzung erst nach Rückfrage. Sonst lädt die App mitten in einer
   Eingabe neu.
4. Beim Start wird `version.json` am Cache vorbei geladen und mit der
   eingebauten Version verglichen. Ob der Browser von sich aus nach einer neuen
   `sw.js` sucht, hängt an seinen eigenen Regeln – bei einer installierten App
   kann das bis zu einem Tag dauern. Weicht die Datei ab, holt die App die neue
   Fassung aktiv nach, statt zu warten.

Das erste `clients.claim()` beim allerersten Start löst dabei bewusst **kein**
Neuladen aus – das wäre kein Update, sondern nur ein überflüssiger Reload für
jeden neuen Nutzer. Gegen ein Neuladen im Kreis (falls `version.json` einmal
nicht zu den ausgelieferten Dateien passt) gibt es eine Bremse: höchstens ein
erzwungener Neustart je Sitzung und Version.

In der Praxis heißt das: **App schließen, öffnen, neue Fassung ist da** – ohne
Knopf. Die laufende Version steht unter *Einstellungen → Über*, dort lässt sich
auch von Hand suchen.

Beim Ausliefern einer neuen Fassung wird die Version an **drei** Stellen
hochgezählt: `js/version.js`, `sw.js` und `version.json`. Ein Test vergleicht
alle drei, und `npm run test:update` prüft den ganzen Weg im Browser.

## Daten

Alles liegt im `localStorage` dieses Browsers. Es gibt keinen Server, keine
Anmeldung und keine Übertragung nach außen. Unter *Einstellungen → Daten* lässt
sich eine JSON-Sicherung schreiben und wieder einspielen – wer den Browserspeicher
leert, verliert den Verlauf sonst.

## Hinweis

Die App ersetzt keine ärztliche Beratung. Bei anhaltend erhöhtem Ruhepuls,
Schmerzen oder Infektzeichen gehört das abgeklärt und nicht wegtrainiert.
