# PRIMR

Eine App für Training, Schlaf und tägliche Aufgaben im Wechselschichtdienst.
Sie läuft als PWA im Browser, speichert alles lokal auf dem Gerät und braucht
weder Server noch Konto.

## Starten

```bash
npm start          # dann http://localhost:8080 öffnen
npm test           # prüft die Rechenkerne (37 Tests, ohne Browser)
```

Auf dem iPhone in Safari öffnen und über *Teilen → Zum Home-Bildschirm* ablegen.
Danach startet sie im Vollbild und funktioniert offline.

## Die fünf Tabs

**Heute** – Datum, Schichttag, die eingetragenen WHOOP-Werte und daraus die
Bereitschaft von 0 bis 100. Hinter „Auswirkungen auf Tag und Training“ steht,
welcher Wert wie stark eingeflossen ist und was das konkret für heute bedeutet.
Darunter die vorgeschlagene Einheit und die Aufgaben des Tages.

**Training** – der Wochenplan, warum jede Einheit an ihrem Tag liegt, die
Zonenverteilung, die Progression und die Vorbelastung der letzten 28 Tage.

**Aufgaben** – tägliche Gewohnheiten und eigene Aufgaben. Eigene Aufgaben können
einmalig, täglich, an festen Wochentagen oder an bestimmten Schichttagen stehen.

**Schlaf** – das Schlaffenster für heute, Abend- und Morgenroutine passend zum
Schichttag, Schlafdauer der letzten 14 Tage und die Fenster der nächsten Woche.

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

### Zusatzdienste

Kurzfristig angeordnete Dienste, Tausch oder Urlaub werden pro Tag
überschrieben: im Trainings-Tab den Tag öffnen und dort den Dienst ändern. Der
Zyklus selbst bleibt unberührt, und die Planung rechnet ab sofort mit dem
geänderten Tag.

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
js/ui/                DOM-Helfer, SVG-Diagramme, geteilte Bausteine
js/views/             die fünf Tabs und die Formulare
test/run.js           Tests der Rechenkerne
sw.js                 Offline-Betrieb
```

## Daten

Alles liegt im `localStorage` dieses Browsers. Es gibt keinen Server, keine
Anmeldung und keine Übertragung nach außen. Unter *Einstellungen → Daten* lässt
sich eine JSON-Sicherung schreiben und wieder einspielen – wer den Browserspeicher
leert, verliert den Verlauf sonst.

## Hinweis

Die App ersetzt keine ärztliche Beratung. Bei anhaltend erhöhtem Ruhepuls,
Schmerzen oder Infektzeichen gehört das abgeklärt und nicht wegtrainiert.
