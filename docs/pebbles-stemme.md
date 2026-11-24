# Pebbles danske stemme

PWA’en og Windows-appen afspiller de samme 27 danske MP3-klip. De syv korte replikker står i `scripts/render-voice.py`. De øvrige tyve læser titlerne og instruktionerne til kropsscanning, meditation og afspænding fra `src/coach.ts`. De to vejrtrækningsøvelser deler de korte ind- og udåndingssignaler.

## Gendan klippene

Produktionen blev kørt lokalt med Python 3.11, Piper 1.8.0, ONNX Runtime 1.32.0, NumPy 2.4.6 og FFmpeg med libmp3lame. Node 22.18 eller nyere læser øvelsernes danske manuskript fra appen. Installér værktøjerne på en produktionsmaskine, hvis der skal læses nye replikker op.

```powershell
$voiceDir = Join-Path $env:TEMP 'aandehul-piper-da'
New-Item -ItemType Directory -Path $voiceDir -Force | Out-Null
py -3.11 -m venv "$voiceDir/venv"
& "$voiceDir/venv/Scripts/python.exe" -m pip install piper-tts==1.8.0 onnxruntime==1.32.0 numpy==2.4.6
$resource = 'https://huggingface.co/rhasspy/piper-voices/resolve/c944985a323d1c7f9a02ee652f2fa43cd9bae205/da/da_DK/talesyntese/medium/da_DK-talesyntese-medium.onnx'
$model = Join-Path $voiceDir 'da_DK-talesyntese-medium.onnx'
Invoke-WebRequest -Uri $resource -OutFile $model
Invoke-WebRequest -Uri ($resource + '.json') -OutFile ($model + '.json')
& "$voiceDir/venv/Scripts/python.exe" scripts/render-voice.py $model
```

Scriptet validerer modellens og konfigurationens SHA-256, renderer med lidt længere taletid og pauser mellem sætninger, og udligner lydstyrken til -20 LUFS. Filerne gemmes i `public/voice/`.

`mouth.json` angiver lydstyrken på en skala fra 0 til 9 for hvert interval på 80 ms. Kurven måles på den dekodede MP3. Svage passager under -48 dB giver en lukket mund. Web og Windows slår direkte op i kurven med afspillerens aktuelle position.

Modelkortet beskriver de anvendte træningsdata som CC0. Ophavet og modeltrænerens kommentar følger med i alle pakker. [Modelkort](https://huggingface.co/rhasspy/piper-voices/blob/c944985a323d1c7f9a02ee652f2fa43cd9bae205/da/da_DK/talesyntese/medium/MODEL_CARD) · [Modeltrænerens kommentar](https://huggingface.co/rhasspy/piper-voices/discussions/12)
