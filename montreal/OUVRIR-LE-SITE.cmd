@echo off
setlocal EnableExtensions EnableDelayedExpansion
title DossierVilleDeMontreal - le site
chcp 65001 >nul

REM ============================================================================
REM  Ouvrir le site avec les donnees deja sur ce PC. Rien d'autre.
REM
REM  Pas de git, pas de npm, pas de reseau : le serveur n'utilise que Node lui-meme.
REM  Il n'y a donc presque rien qui puisse echouer. Ce script se contente de trouver
REM  le dossier du volet, d'ouvrir le navigateur et de servir les fichiers.
REM
REM  Pour rafraichir les donnees : LANCER-MONTREAL.cmd.
REM  Pour mettre le code a jour avant d'ouvrir : VOIR-MONTREAL.cmd.
REM
REM  Fermer la fenetre arrete le site.
REM ============================================================================

set "PORT=4321"

echo.
echo  ===================================================
echo   DossierVilleDeMontreal - le site
echo  ===================================================
echo.

REM ---- Node.js ----------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  [!] Node.js n'est pas installe. Telechargez la version LTS ici, installez-la,
  echo      puis relancez ce script :  https://nodejs.org/
  goto :fin
)

REM ---- Ou est le volet ? -------------------------------------------------------
REM On essaie, dans l'ordre : le dossier de ce script, son sous-dossier montreal, puis
REM les emplacements habituels. Le bon dossier est celui qui contient index.html ET le
REM serveur. On accepte aussi l'ancien nom villedemontreal, au cas ou.
set "VOLET="
call :essayer "%~dp0."
call :essayer "%~dp0montreal"
call :essayer "%~dp0villedemontreal"
call :essayer "%USERPROFILE%\Documents\DossierVilleMontreal\montreal"
call :essayer "%USERPROFILE%\Documents\DossierVilleMontreal\villedemontreal"
call :essayer "%USERPROFILE%\Documents\DossierVilleMontreal"
call :essayer "%USERPROFILE%\Documents\DossierQuebec\montreal"

if not defined VOLET (
  echo  [!] Je ne trouve pas le dossier du site.
  echo.
  echo      Je cherche un dossier qui contient index.html et scripts\static-server.js.
  echo      J'ai regarde ici :
  echo        "%~dp0"
  echo        "%USERPROFILE%\Documents\DossierVilleMontreal\montreal"
  echo.
  echo      Deux solutions : deposez ce fichier .cmd DANS le dossier montreal et
  echo      relancez-le, ou lancez LANCER-MONTREAL.cmd une fois pour telecharger le tout.
  goto :fin
)

cd /d "%VOLET%"
echo  Dossier   : "%VOLET%"
if exist "data\decisions.json" (
  for %%f in ("data\decisions.json") do echo  Donnees   : %%~tf
) else (
  echo.
  echo  [!] Ce dossier n'a pas de donnees ^(data\decisions.json^).
  echo      Lancez LANCER-MONTREAL.cmd une fois pour les extraire.
  goto :fin
)
echo  Adresse   : http://localhost:%PORT%
echo.
echo  ^(Fermez cette fenetre pour arreter le site.^)
echo.

start "" "http://localhost:%PORT%"
node "scripts\static-server.js"

REM Le serveur sort avec 2 quand le port est deja pris : le site tourne dans une autre
REM fenetre, la page vient de s'ouvrir dessus, il n'y a rien a signaler.
if errorlevel 3 goto :fin
if errorlevel 2 (
  echo.
  echo  Le site tournait deja dans une autre fenetre : la page est ouverte dans le navigateur.
  goto :fin
)
if errorlevel 1 goto :fin
goto :eof

REM ---- Sous-routine : ce dossier est-il le volet ? -----------------------------
:essayer
if defined VOLET goto :eof
if exist "%~1\index.html" if exist "%~1\scripts\static-server.js" set "VOLET=%~f1"
goto :eof

:fin
echo.
pause
