@echo off
setlocal EnableExtensions
title DossierVilleDeMontreal - le site en local
REM UTF-8 dans la fenetre : les accents des messages de Node s'affichent correctement.
chcp 65001 >nul

REM ============================================================================
REM  DossierVilleDeMontreal - VOIR le site, sans rien extraire (Windows).
REM
REM  Ce qu'il fait, dans l'ordre :
REM    1. verifie que Node.js et Git sont installes ;
REM    2. ramene sa copie du depot (Documents\DossierVilleMontreal) a la derniere version
REM       de la branche sur GitHub - donnees comprises, celles que GitHub Actions a
REM       extraites ce matin ;
REM    3. ouvre http://localhost:4321 dans le navigateur et sert le site.
REM
REM  Il ne lit aucun proces-verbal et n'envoie rien sur GitHub : quelques secondes, pas
REM  quelques minutes. Pour extraire des donnees fraiches, c'est LANCER-MONTREAL.cmd.
REM  Fermer la fenetre arrete le site.
REM ============================================================================

set "BRANCHE=claude/villedemontreal"
set "DEPOT_URL=https://github.com/GrandFFormat/DossierQuebec"
set "DEPOT=%USERPROFILE%\Documents\DossierVilleMontreal"
set "VOLET=%DEPOT%\montreal"

REM Windows lit un .cmd pendant qu'il l'execute : on ne tourne jamais depuis un fichier
REM que git pourrait reecrire. Premiere etape, toujours : se recopier dans le dossier
REM temporaire et se relancer de la. "relance" en argument = on y est deja.
if /i not "%~1"=="relance" (
  copy /y "%~f0" "%TEMP%\VOIR-MONTREAL.cmd" >nul
  call "%TEMP%\VOIR-MONTREAL.cmd" relance
  exit /b
)

echo.
echo  ===================================================
echo   DossierVilleDeMontreal - le site en local
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

REM ---- 2. La copie du depot, a la derniere version (donnees comprises) -------
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
REM ls-remote sort avec 2 si la branche n'existe plus, et avec 128 s'il n'y a pas de reseau :
REM les deux cas ne se reglent pas de la meme facon, autant le dire.
git ls-remote --exit-code --heads origin "%BRANCHE%" >nul 2>nul
if errorlevel 128 (
  echo  [!] GitHub est injoignable : le site s'ouvre avec les donnees deja sur ce PC.
  echo.
  goto :servir
)
if errorlevel 1 (
  echo  [!] La branche %BRANCHE% n'existe plus sur GitHub.
  echo      Retelechargez VOIR-MONTREAL.cmd, ou demandez a Claude la nouvelle version.
  goto :fin_erreur
)
git fetch origin "%BRANCHE%"
if errorlevel 1 (
  echo  [!] GitHub est injoignable : le site s'ouvre avec les donnees deja sur ce PC.
  echo.
  goto :servir
)
REM checkout -B + reset --hard : quoi qu'il soit arrive dans ce dossier, on repart de la
REM version exacte de GitHub. Le cache data\textes\ (non versionne) survit.
REM -f : on jette ce qui traine dans le dossier. Sans lui, git REFUSE le checkout des
REM qu'un fichier suivi a ete modifie ici (une extraction interrompue, par exemple) et
REM le reset --hard ci-dessous, cense tout rattraper, n'est jamais atteint.
git checkout -q -f -B "%BRANCHE%" "origin/%BRANCHE%"
if errorlevel 1 (
  echo  [!] Impossible de se placer sur la branche %BRANCHE%.
  goto :fin_erreur
)
git reset -q --hard "origin/%BRANCHE%"
for /f "tokens=*" %%v in ('git log -1 --format^=%%h') do set "VERSION=%%v"
for /f "tokens=*" %%v in ('git log -1 --date^=short --format^=%%cd') do set "DATE_DONNEES=%%v"
echo  Version du code : %VERSION%  ^(derniere mise a jour : %DATE_DONNEES%^)
echo.

REM ---- 3. Se relancer depuis la version fraiche du script, si elle a change ---------
REM fc renvoie 2 quand un des deux fichiers est introuvable, et "if errorlevel 1" est vrai
REM pour 2 comme pour 1 : sans cette garde, un script absent de la branche se relancerait
REM lui-meme sans fin. Le deuxieme argument borne la recursion a un seul tour.
if not exist "%VOLET%\VOIR-MONTREAL.cmd" goto :servir
if /i "%~2"=="deja" goto :servir
fc /b "%~f0" "%VOLET%\VOIR-MONTREAL.cmd" >nul 2>nul
if errorlevel 1 (
  echo  Le script a ete mis a jour : relance avec sa nouvelle version ...
  echo.
  copy /y "%VOLET%\VOIR-MONTREAL.cmd" "%TEMP%\VOIR-MONTREAL.cmd" >nul
  if errorlevel 1 (
    echo  [!] Impossible de recopier le script : on continue avec la version actuelle.
  ) else (
    call "%TEMP%\VOIR-MONTREAL.cmd" relance deja
    exit /b
  )
)

:servir
REM ---- 4. Le site en local ----------------------------------------------------
cd /d "%VOLET%"
if not exist "data\decisions.json" (
  echo  [!] Pas encore de donnees dans "%VOLET%\data".
  echo      Lancez LANCER-MONTREAL.cmd une fois, ou attendez le passage quotidien de GitHub.
  goto :fin_erreur
)
echo  Ouverture du site : http://localhost:4321
echo  ^(Fermez cette fenetre pour arreter le site.^)
echo.
start "" "http://localhost:4321"
node scripts\static-server.js
if errorlevel 1 goto :fin_erreur
goto :eof

:fin_erreur
echo.
echo  Le script s'est arrete. Copiez le texte de cette fenetre ^(ou une capture d'ecran^)
echo  et envoyez-le a Claude.
echo.
pause
