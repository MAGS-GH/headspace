# Åndehul

Et lille, dansksproget pusterum med seks guidede øvelser og Pebble, en flytbar skrivebordsven. PWA'en og Windows-appen virker hver især lokalt. Favoritter, indtjekninger og øvelseshistorik gemmes på enheden i den app eller browserprofil, hvor de blev oprettet.

## Start med en pause

Tryk på **Hils på mig** for at høre Pebble. Under **Start en pause** viser stenen dig rytmen med hele kroppen. Den løfter sig og vokser ved indånding og synker ned med rund mund ved udånding. Pilen og sekundtallet viser, hvor du er i åndedrættet. **Ét minut med mig** under **Mød Pebble** åbner en kort pause.

Pebble kan også læse de danske meditationer og afspændingsøvelser højt. Stemmen følger med appen og virker offline. Brug **Pebbles stemme** i afspilleren for at slå tale til eller fra. Appen husker valget. Du kan ændre varigheden, holde pause og slå guideklange til undervejs.

I **Lydmiljø** kan du vælge regn, havbrus eller skovvind. Lydene dannes på enheden. I **Indstillinger** kan du begrænse bevægelse og installere PWA'en. Åbn webudgaven én gang online, så browseren kan gemme appen, illustrationerne og skrifttyperne til offlinebrug. Installation kræver HTTPS eller localhost.

## Pebble på Windows

1. Hent [Windows-pakken](public/downloads/Aandehul-Windows.zip) eller vælg **Mød Pebble → Hent til Windows** i webappen.
2. Pak hele mappen ud, og start `Aandehul.exe`. Den lille pakke bruger .NET 10 Desktop Runtime (x64) og Microsoft Edge WebView2 Runtime på Windows 10 eller 11.
3. Klik på Pebble for en vejrtrækningspause på ét minut. Klik igen for at holde pause eller fortsætte. Træk figuren til den ønskede placering.
4. Åbn menuen på figuren for at hilse, vælge oplæsning eller slå mindre bevægelse til. Du kan også bruge ikonet ved uret til at åbne Åndehul, skjule figuren eller afslutte appen. Når øvelsesvinduet lukkes, bliver figuren ved med at køre.

Windows-appen indlæser sit medfølgende øvelsesrum i WebView2. Pebble-pauser vises i historikken i dette øvelsesrum. Appdata og vinduesplacering ligger i `%LOCALAPPDATA%\Aandehul`.

## Lokal webapp med Docker

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Åbn [Åndehul på localhost](http://localhost:4173). Du kan ændre den lokale port med `WEB_PORT`.

## Udvikling

Webappen bruger TypeScript og Vite. Kør fra projektets rod med en Node.js-version, der opfylder `engines` i `package.json`, eksempelvis Node.js 22.12 eller nyere i 22-serien.

```sh
npm ci
npm run dev
```

`npm run build` typekontrollerer koden og opretter en offlineklar udgave i `dist/`. `npm run preview` serverer den byggede udgave. Service workeren registreres i produktionsbuildet. Ved en opdatering kan browseren aktivere den nye offlineversion, når de tidligere åbne appvinduer er lukket.

## Byg Windows-pakkerne

Kør på Windows x64 med .NET 10 SDK og Node.js installeret.

```powershell
.\desktop\Publish.ps1
```

Scriptet bygger PWA'en og pakker den sammen med WPF-appen. Den lille download lander i `public/downloads/Aandehul-Windows.zip`. Den selvstændige udgave med .NET inkluderet lander i `artifacts/Aandehul-Windows-x64.zip`. Begge bruger WebView2 til det fulde øvelsesvindue. Kør scriptet igen efter ændringer i web- eller desktopkoden, så hjemmesidens Windows-download følger med.

## Dokploy

Brug `docker-compose.yml` sammen med `docker-compose.dokploy.yml`. Angiv `APP_HOST` og et unikt `ROUTER_NAME` i miljøet. Webcontaineren lytter på port 3000 og bruger det eksisterende eksterne `dokploy-network` til Traefik. Der er kun brug for den statiske webservice.

Illustrationerne er lavet til Åndehul. Licenser for Lucide, DM Sans og Lora følger med i den byggede app under `licenses/`. [Kilde og byggevejledning til Pebbles stemme](docs/pebbles-stemme.md) beskriver, hvordan taleklip og mundbevægelser laves.
