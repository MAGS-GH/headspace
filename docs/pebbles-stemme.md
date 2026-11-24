# Pebbles danske stemme

Pebbles 27 danske taleklip er fremstillet med **CoRal Røst v3 Chatterbox 500M**, en dansk tilpasning af Resemble AI’s Chatterbox Multilingual. Modellen er trænet af Daniel Christopher Biørrith ved Alexandra Instituttet som led i CoRal-projektet. PWA’en og Windows-appen afspiller de færdige MP3-filer lokalt. [CoRals modelkort for den anvendte revision](https://huggingface.co/CoRal-project/roest-v3-chatterbox-500m/blob/7ce205cea6b3b36d9f60f18abb88ff21fa04ea0d/README.md)

## Hvilken stemme taler?

Pebble bruger modellens indbyggede standardstemme fra `conds.pt`, på dansk og uden en ekstern stemmeoptagelse. Det er samme stemmevalg som i LUP-roulettens udgivne Røst-lydbank. CoRals demo lader lytteren vælge **Mic** eller **Nic** ved at give modellen en særskilt referenceoptagelse. Demoen har Mic forvalgt. [Demoens stemmevalg](https://huggingface.co/spaces/alexandrainst/roest-chatterbox-demo/blob/91577dc12dd58f8302052bf2b6317287ea549bdc/app.py) · [Modellens indbyggede stemmefil](https://huggingface.co/CoRal-project/roest-v3-chatterbox-500m/blob/7ce205cea6b3b36d9f60f18abb88ff21fa04ea0d/conds.pt)

Modelrevisionen er `7ce205cea6b3b36d9f60f18abb88ff21fa04ea0d`. Generatoren kontrollerer alle fem modelfiler. Standardstemmefilens SHA-256 er `6552d70568833628ba019c6b03459e77fe71ca197d5c560cef9411bee9d87f4e`.

## Gendan klippene

Åndehuls model blev indlæst direkte fra de fem lokale filer på Windows med Python 3.11.9, PyTorch og torchaudio 2.6.0 til CPU, Chatterbox 0.1.7 og Perth 1.0.1. Bygningen bruger også Node.js 22.18 eller nyere og FFmpeg med libmp3lame. Kør følgende fra projektets rod for at oprette et særskilt byggemiljø på Windows.

```powershell
$voiceBuild = Join-Path $env:LOCALAPPDATA 'Aandehul-voice-build'
$modelDir = Join-Path $voiceBuild 'model'
$venvDir = Join-Path $voiceBuild 'venv'
$python = Join-Path $venvDir 'Scripts/python.exe'
New-Item -ItemType Directory -Path $modelDir -Force | Out-Null
py -3.11 -m venv $venvDir
& $python -m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
& $python -m pip install chatterbox-tts==0.1.7 resemble-perth==1.0.1 setuptools==80.9.0 soundfile==0.14.0
```

Hent de fem filer fra den faste revision. Modelvægtene fylder tilsammen cirka 3,2 GB. Hvis du allerede har dette checkpoint lokalt, kan du sætte `$modelDir` til dets mappe.

```powershell
$revision = '7ce205cea6b3b36d9f60f18abb88ff21fa04ea0d'
$source = "https://huggingface.co/CoRal-project/roest-v3-chatterbox-500m/resolve/$revision"
foreach ($file in @('conds.pt','ve.pt','s3gen.pt','t3_mtl23ls_v2.safetensors','grapheme_mtl_merged_expanded_v1.json')) {
    curl.exe --fail --location --retry 2 --output (Join-Path $modelDir $file) "$source/$file"
    if ($LASTEXITCODE -ne 0) { throw "Kunne ikke hente $file" }
}
```

Byg lydbanken med den lokale model. Med en kompatibel CUDA-installation af PyTorch kan du vælge `--device cuda`. En fast tilfældighedsværdi pr. replik gør det muligt at genskabe et enkelt klip. Forskelle i hardware og softwareversion kan påvirke lydfilens præcise indhold.

```powershell
$rawDir = Join-Path $voiceBuild 'raw'
& $python scripts/render-voice.py --model $modelDir --device cpu --raw-dir $rawDir
```

De syv korte replikker står i `scripts/render-voice.py`. De tyve trin til meditation og afspænding følger titlerne og instruktionerne i `src/coach.ts`. De to vejrtrækningsøvelser deler ind- og udåndingssignaler.

En almindelig kørsel genskaber alle 27 valgte indlæsninger med tagning 1. Første trin i **Kropsscanning**, **Et roligt øjeblik** og **Lette skuldre** bliver indlæst én sætning ad gangen med 250 ms imellem. Til en prøve kan du bruge `--clip greeting` for én replik eller eksempelvis `--clip greeting --take 2` for en anden tagning. Med `--split` kan du også afprøve sætningsvis indlæsning af et enkelt andet klip.

Råklip gemmes som WAV sammen med oplysninger om tekst, stemmeprofil, tilfældighedsværdi og filens SHA-256. Generatoren kan genbruge en tidligere kørsel, når oplysningerne stemmer. Den beskærer stilheden ved start og slut og kontrollerer, at hvert trin passer ind i den korteste øvelsesvarighed. Guidede trin kan sænkes op til 20 procent med bevaret tonehøjde og et sigtepunkt på 165 ord i minuttet. Hilsner og åndedrætssignaler beholder den indlæste hastighed. FFmpeg skriver mono-MP3 ved 24 kHz og 80 kbit/s med et mål på −20 LUFS.

De færdige klip ligger i `public/voice/`. Med `--output` kan du vælge en anden mappe til en prøve. Generatoren måler lydstyrken i hver færdig MP3 og gemmer en værdi fra 0 til 9 for hver 80 ms i `mouth.json`. Pebbles mund følger denne kurve under afspilningen. Efter ændringer i lydbanken genbygger du Windows-pakkerne med `desktop/Publish.ps1` og dernæst webudgaven.

## Licens og oprindelse

Modellen er omfattet af Alexandra Instituttet A/S’ *Software – License to Use* med OpenRAIL-vilkår. Afsnit III, punkt 5 beskriver ansvaret for brug af modellens output. Appen distribuerer de genererede klip og mundkurven. Chatterbox tilføjer sit indbyggede Perth-lydvandmærke under syntesen. [Licens for den anvendte revision](https://huggingface.co/CoRal-project/roest-v3-chatterbox-500m/blob/7ce205cea6b3b36d9f60f18abb88ff21fa04ea0d/LICENSE) · [Chatterbox](https://github.com/resemble-ai/chatterbox)
