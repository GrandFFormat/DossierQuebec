@echo off
setlocal EnableExtensions
title DossierVilleDeMontreal - mise a jour des donnees
REM UTF-8 dans la fenetre : les accents des messages de Node s'affichent correctement.
chcp 65001 >nul

REM ============================================================================
REM  DossierVilleDeMontreal - script a double-cliquer (Windows).
REM
REM  Ce qu'il fait, dans l'ordre :
REM    1. verifie que Node.js et Git sont installes ;
REM    2. tient SA PROPRE copie du depot dans Documents\DossierVilleMontreal, toujours
REM       ramenee exactement a la derniere version de la branche sur GitHub - il ne
REM       touche a aucun autre dossier DossierQuebec du PC ;
REM    3. se relance lui-meme depuis cette copie, pour tourner avec sa propre derniere
REM       version sans qu'on ait a le retelecharger ;
REM    4. installe les dependances ;
REM    5. lance la routine (calendrier, decisions, votes, elus, districts...) en ecrivant
REM       tout dans data\lancement.log ;
REM    6. envoie les donnees et le journal sur GitHub ;
REM    7. ouvre le site en local dans le navigateur.
REM
REM  Rien a taper. S'il y a un probleme, la fenetre reste ouverte et dit lequel.
REM ============================================================================

set "BRANCHE=claude/montreal"
set "DEPOT_URL=https://github.com/GrandFFormat/DossierQuebec"
set "DEPOT=%USERPROFILE%\Documents\DossierVilleMontreal"
set "VOLET=%DEPOT%\montreal"

REM Windows lit un .cmd pendant qu'il l'execute : on ne tourne jamais depuis un fichier
REM que git pourrait reecrire. Premiere etape, toujours : se recopier dans le dossier
REM temporaire et se relancer de la. "relance" en argument = on y est deja.
if /i not "%~1"=="relance" (
  copy /y "%~f0" "%TEMP%\LANCER-MONTREAL.cmd" >nul
  call "%TEMP%\LANCER-MONTREAL.cmd" relance
  exit /b
)

echo.
echo  ===================================================
echo   DossierVilleDeMontreal - mise a jour des donnees
echo  ===================================================
echo.

REM ---- 1. Outils -------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  [!] Node.js n'est pas installe. Telechargez la version LTS ici, installez-la,
  echo      puis relancez ce script :  https://nodejs.org/
  goto :fin_erreur
)
where git >nul 2>nul
if errorlevel 1 (
  echo  [!] Git n'est pas installe. Telechargez-le ici, installez-le avec les choix
  echo      par defaut, puis relancez ce script :  https://git-scm.com/download/win
  goto :fin_erreur
)
for /f "tokens=*" %%v in ('node --version') do echo  Node.js %%v  -  OK
for /f "tokens=*" %%v in ('git --version') do echo  %%v  -  OK
echo.

REM ---- 2. La copie du depot, exactement a la derniere version ----------------
if not exist "%DEPOT%\.git" (
  echo  Telechargement du depot dans "%DEPOT%" ...
  git clone --branch "%BRANCHE%" "%DEPOT_URL%" "%DEPOT%"
  if errorlevel 1 (
    echo  [!] Le telechargement du depot a echoue. Verifiez la connexion Internet.
    goto :fin_erreur
  )
)
cd /d "%DEPOT%"
if errorlevel 1 (
  echo  [!] Impossible d'ouvrir "%DEPOT%".
  goto :fin_erreur
)
echo  Mise a jour depuis GitHub ...
git fetch origin "%BRANCHE%"
if errorlevel 1 (
  echo  [!] Impossible de joindre GitHub. Verifiez la connexion Internet.
  goto :fin_erreur
)
REM checkout -B + reset --hard : quoi qu'il soit arrive dans ce dossier, on repart de la
REM version exacte de GitHub. Le cache data\textes\ (non versionne) survit.
git checkout -B "%BRANCHE%" "origin/%BRANCHE%"
if errorlevel 1 (
  echo  [!] Impossible de se placer sur la branche %BRANCHE%.
  goto :fin_erreur
)
git reset -q --hard "origin/%BRANCHE%"
for /f "tokens=*" %%v in ('git log -1 --format^=%%h') do set "VERSION=%%v"
echo  Version du code : %VERSION%
echo.

REM ---- 3. Se relancer depuis la version fraiche du script, si elle a change ---------
fc /b "%~f0" "%VOLET%\LANCER-MONTREAL.cmd" >nul 2>nul
if errorlevel 1 (
  echo  Le script a ete mis a jour : relance avec sa nouvelle version ...
  echo.
  copy /y "%VOLET%\LANCER-MONTREAL.cmd" "%TEMP%\LANCER-MONTREAL.cmd" >nul
  call "%TEMP%\LANCER-MONTREAL.cmd" relance
  exit /b
)

REM ---- 4. Les dependances ---------------------------------------------------
cd /d "%VOLET%"
echo  Dependances ...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo  [!] L'installation des dependances a echoue. Voir les messages ci-dessus.
  goto :fin_erreur
)
echo.

REM ---- 5. La routine --------------------------------------------------------
echo  ---------------------------------------------------
echo   Extraction des donnees de la Ville de Montreal
echo   (quelques minutes : les proces-verbaux sont de gros PDF)
echo   Tout est ecrit dans data\lancement.log
echo  ---------------------------------------------------
echo.
REM Chaque ligne va a la fois a l'ecran (pour voir que ca avance) et dans le journal
REM (pour que Claude puisse le lire sur GitHub). PowerShell fait le double envoi.
> "data\lancement.log" echo Version du code : %VERSION%
set "OPTIONS=--elus"
if not exist "api.env" (
  echo  Pas de fichier api.env : les resumes en langage clair sont sautes.
  echo  ^(Pour les activer : copier api.env.example en api.env et y mettre la cle.^)
  echo.
  set "OPTIONS=--elus --sans-resumes"
)
call npm run refresh -- %OPTIONS% 2>&1 | powershell -NoProfile -Command "$input | ForEach-Object { if ($_ -notmatch '^Warning:') { $_ }; Add-Content -Encoding utf8 -Path 'data\lancement.log' -Value $_ }"
echo.

REM ---- 6. Envoi sur GitHub --------------------------------------------------
cd /d "%DEPOT%"
git add montreal/data
git diff --cached --quiet
if errorlevel 1 (
  echo  Envoi des donnees sur GitHub ...
  git -c user.name="DossierVille" -c user.email="dossierville@users.noreply.github.com" commit -q -m "Donnees Montreal - lancement local du %DATE% (code %VERSION%)"
  git push origin "%BRANCHE%"
  if errorlevel 1 (
    echo  [!] L'envoi sur GitHub a echoue ^(pas d'acces en ecriture depuis ce PC ?^).
    echo      Les donnees sont quand meme sur ce PC, dans %VOLET%\data.
  ) else (
    echo  Donnees envoyees sur GitHub, branche %BRANCHE%.
  )
) else (
  echo  Aucune nouvelle donnee a envoyer sur GitHub.
)
echo.

REM ---- 7. Le site en local --------------------------------------------------
cd /d "%VOLET%"
echo  Ouverture du site : http://localhost:4321
echo  ^(Fermez cette fenetre pour arreter le site.^)
echo.
start "" "http://localhost:4321"
node scripts\static-server.js
goto :eof

:fin_erreur
echo.
echo  Le script s'est arrete. Copiez le texte de cette fenetre ^(ou une capture d'ecran^)
echo  et envoyez-le a Claude.
echo.
pause
