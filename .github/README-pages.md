# GitHub Pages

Die App besteht aus statischen Dateien im Wurzelverzeichnis des Repos und
braucht keinen Build. Einstellung im Repo:

    Settings → Pages → Source: "Deploy from a branch"
                     → Branch: main, Ordner: / (root)

Danach liegt sie unter `https://<nutzer>.github.io/PRIMR/` und bekommt jeden
Stand, der nach `main` geht.

`.nojekyll` im Wurzelverzeichnis schaltet die Jekyll-Verarbeitung ab. Ohne die
Datei behandelt Pages das Repo als Jekyll-Seite: Ordner und Dateien, die mit
einem Unterstrich beginnen, werden verworfen, und ausgeliefert wird nicht mehr
das, was im Repo steht.

Vor jedem Stand auf `main`:

    npm run stamp && npm test
