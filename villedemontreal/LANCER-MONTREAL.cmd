@echo off
setlocal EnableExtensions
title DossierVilleDeMontreal - mise a jour des donnees

REM ============================================================================
REM  DossierVilleDeMontreal - script a double-cliquer (Windows).
REM
REM  Ce qu'il fait, dans l'ordre :
REM    1. verifie que Node.js et Git sont installes ;
REM    2. trouve le depot DossierQuebec sur ce PC (ou le telecharge dans
REM       Documents\DossierQuebec s'il n'y est pas) ;
REM    3. se met sur la branche du volet Montreal et prend la derniere version ;
REM    4. installe les dependances (la premiere fois seulement) ;
REM    5. lance la routine : calendrier, decisions, votes, elus, districts... ;
REM    6. envoie les donnees produites sur GitHub (si le PC y a acces) ;
REM    7. ouvre le site en local dans le navigateur.
REM
REM  Rien a taper. S'il y a un probleme, la fenetre reste ouverte et dit lequel.
REM ============================================================================

set "BRANCHE=claude/villedemontreal"
set "DEPOT_URL=https://github.com/GrandFFormat/DossierQuebec"

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

REM ---- 2. Le depot -----------------------------------------------------------
set "VOLET="
if exist "%~dp0scrapers\decisions.js" set "VOLET=%~dp0"
if not defined VOLET if exist "%USERPROFILE%\Documents\DossierQuebec\villedemontreal\scrapers\decisions.js" set "VOLET=%USERPROFILE%\Documents\DossierQuebec\villedemontreal\"
if not defined VOLET if exist "%USERPROFILE%\DossierQuebec\villedemontreal\scrapers\decisions.js" set "VOLET=%USERPROFILE%\DossierQuebec\villedemontreal\"

if not defined VOLET (
  echo  Le depot DossierQuebec n'est pas sur ce PC : telechargement dans
  echo  "%USERPROFILE%\Documents\DossierQuebec" ...
  git clone --branch "%BRANCHE%" "%DEPOT_URL%" "%USERPROFILE%\Documents\DossierQuebec"
  if errorlevel 1 (
    echo  [!] Le telechargement du depot a echoue. Verifiez la connexion Internet.
    goto :fin_erreur
  )
  set "VOLET=%USERPROFILE%\Documents\DossierQuebec\villedemontreal\"
)

REM %VOLET% se termine par une barre oblique inverse.
cd /d "%VOLET%.."
if errorlevel 1 (
  echo  [!] Impossible d'ouvrir le dossier du depot.
  goto :fin_erreur
)
echo  Depot : %CD%
echo.

REM ---- 3. La branche du volet Montreal --------------------------------------
echo  Mise a jour depuis GitHub ...
git fetch origin "%BRANCHE%"
if errorlevel 1 (
  echo  [!] Impossible de joindre GitHub. Verifiez la connexion Internet.
  goto :fin_erreur
)
git checkout "%BRANCHE%" >nul 2>nul
if errorlevel 1 (
  echo  [!] Impossible de passer sur la branche %BRANCHE%.
  echo      Il y a probablement des modifications non enregistrees dans le depot.
  goto :fin_erreur
)
git pull --ff-only origin "%BRANCHE%"
if errorlevel 1 (
  echo  [!] La branche locale et GitHub ont diverge. On continue avec la version locale.
)
echo.

REM ---- 4. Les dependances ---------------------------------------------------
cd /d "%VOLET%"
if not exist "node_modules\pdfjs-dist\package.json" (
  echo  Installation des dependances - la premiere fois seulement, une minute ...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo  [!] L'installation a echoue. Voir les messages ci-dessus.
    goto :fin_erreur
  )
  echo.
)

REM ---- 5. La routine --------------------------------------------------------
echo  ---------------------------------------------------
echo   Extraction des donnees de la Ville de Montreal
echo   (quelques minutes : les proces-verbaux sont de gros PDF)
echo  ---------------------------------------------------
echo.
if exist "api.env" (
  call npm run refresh
) else (
  echo  Pas de fichier api.env : les resumes en langage clair sont sautes.
  echo  ^(Pour les activer : copier api.env.example en api.env et y mettre la cle.^)
  echo.
  call npm run refresh -- --sans-resumes
)
set "CODE_REFRESH=%errorlevel%"
echo.
if not "%CODE_REFRESH%"=="0" (
  echo  [!] Une extraction principale a echoue ^(voir le Bilan ci-dessus^).
  echo      Les autres donnees ont quand meme ete ecrites.
  echo      Copiez le texte de cette fenetre et envoyez-le a Claude : il corrigera.
  echo.
)

REM ---- 6. Envoi sur GitHub --------------------------------------------------
cd /d "%VOLET%.."
git add villedemontreal/data
git diff --cached --quiet
if errorlevel 1 (
  echo  Envoi des donnees sur GitHub ...
  git -c user.name="DossierVille" -c user.email="dossierville@users.noreply.github.com" commit -q -m "Donnees Montreal - lancement local du %DATE%"
  git push origin "%BRANCHE%"
  if errorlevel 1 (
    echo  [!] L'envoi sur GitHub a echoue ^(pas d'acces en ecriture depuis ce PC ?^).
    echo      Les donnees sont quand meme sur ce PC, dans villedemontreal\data.
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
echo  Le script s'est arrete. Copiez le texte de cette fenetre et envoyez-le a Claude.
echo.
pause
