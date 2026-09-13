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
REM    3. se relance depuis la version du script qui est dans le depot ;
REM    4. ouvre http://localhost:4321 dans le navigateur et sert le site.
REM
REM  Il ne lit aucun proces-verbal et n'envoie rien sur GitHub : quelques secondes, pas
REM  quelques minutes. Pour extraire des donnees fraiches, c'est LANCER-MONTREAL.cmd.
REM  Fermer la fenetre arrete le site.
REM
REM  Trois tours : le fichier double-clique (tour 0) se recopie dans %TEMP% et se
REM  relance (tour 1) ; le tour 1 met le depot a jour, puis relance la copie du depot
REM  (tour 2, argument "deja") qui sert le site. Chaque tour tourne depuis un fichier
REM  que personne ne reecrit pendant qu'il s'execute : cmd lit un .cmd au fur et a
REM  mesure, et git reset --hard remplace celui du depot.
REM ============================================================================

set "BRANCHE=claude/villedemontreal"
set "DEPOT_URL=https://github.com/GrandFFormat/DossierQuebec"
set "DEPOT=%USERPROFILE%\Documents\DossierVilleMontreal"
set "VOLET=%DEPOT%\montreal"
REM Le verrou : un fichier que LANCER-MONTREAL garde OUVERT pendant qu'il extrait. cmd
REM ouvre ses redirections sans partage en ecriture, donc tant qu'une fenetre le tient,
REM personne d'autre ne peut l'ouvrir ; et fermer cette fenetre le libere, quoi qu'il
REM arrive. Rien ne reste jamais a supprimer a la main.
set "VERROU=%TEMP%\DossierVilleMontreal.verrou"

REM ---- Tour 0 : se recopier dans %TEMP% sous un nom unique et se relancer de la ------
REM Nom unique : %RANDOM% est seme avec l'heure en secondes, deux fenetres ouvertes la
REM meme seconde tirent la meme suite. md est atomique et echoue si le dossier existe :
REM le nom n'appartient qu'a la fenetre qui l'a cree (on ne reessaie que sur collision,
REM pas si %TEMP% est inaccessible). TOUR est herite par les tours suivants.
if defined TOUR goto :tour_ok
:tour_nom
set "TOUR=%TEMP%\VOIR-MONTREAL-%RANDOM%%RANDOM%"
md "%TOUR%" 2>nul || if exist "%TOUR%\*" goto :tour_nom
:tour_ok
if /i not "%~1"=="relance" (
  REM Menage : quand on ferme la fenetre, le rd ci-dessous n'est jamais atteint et le
  REM dossier reste. On ne balaie que ceux d'au moins deux jours : une fenetre encore
  REM ouverte peut executer les plus recents.
  forfiles /p "%TEMP%" /m "VOIR-MONTREAL-*" /d -2 /c "cmd /c if @isdir==TRUE rd /s /q @path" >nul 2>nul
  copy /y "%~f0" "%TOUR%\1.cmd" >nul
  if errorlevel 1 (
    echo  [!] Impossible de se recopier dans "%TEMP%".
    goto :fin_erreur
  )
  call "%TOUR%\1.cmd" relance
  rd /s /q "%TOUR%" 2>nul
  exit /b
)

REM ---- Tour 2 : le depot est deja a jour, il ne reste qu'a servir -----------------
if /i "%~2"=="deja" goto :servir

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

REM ---- 2. La copie du depot, exactement a la derniere version ----------------
if not exist "%DEPOT%\.git" (
  echo  Telechargement du depot dans "%DEPOT%" ...
  git clone --branch "%BRANCHE%" "%DEPOT_URL%" "%DEPOT%"
  if errorlevel 1 (
    echo  [!] Le telechargement du depot a echoue. Verifiez la connexion Internet, et
    echo      qu'aucun dossier "%DEPOT%" a moitie rempli ne traine deja.
    goto :fin_erreur
  )
)
cd /d "%DEPOT%"
if errorlevel 1 (
  echo  [!] Impossible d'ouvrir "%DEPOT%".
  goto :fin_erreur
)
REM ---- Une extraction tourne-t-elle deja dans une autre fenetre ? -----------------
REM Si oui, on ne touche pas au depot : la remise a zero ci-dessous ecraserait les
REM fichiers qu'elle est en train d'ecrire.
2>nul ( >>"%VERROU%" (call ) ) || (
  echo  [!] LANCER-MONTREAL.cmd est en train d'extraire des donnees dans une autre fenetre.
  echo      Attendez qu'il affiche "Ouverture du site", puis relancez ce script.
  echo.
  pause
  goto :eof
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
REM checkout -f -B + reset --hard : quoi qu'il soit arrive dans ce dossier, on repart de
REM la version exacte de GitHub. Le cache data\textes\ (non versionne) survit.
REM Sans -f, git REFUSE le checkout des qu'un fichier suivi a ete modifie ici (une
REM extraction interrompue, par exemple) et le reset --hard n'est jamais atteint.
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

REM ---- 3. Se relancer depuis la copie du depot, sous un autre nom ----------------
REM Un autre nom : on ne reecrit jamais le fichier en cours d'execution. Pas de
REM comparaison prealable, elle serait faussee par les fins de ligne (le depot livre
REM du CRLF, un telechargement direct du LF). L'argument "deja" borne a un tour.
if not exist "%VOLET%\VOIR-MONTREAL.cmd" goto :servir
copy /y "%VOLET%\VOIR-MONTREAL.cmd" "%TOUR%\2.cmd" >nul
if errorlevel 1 (
  echo  [!] Impossible de recopier le script : on continue avec la version actuelle.
  goto :servir
)
call "%TOUR%\2.cmd" relance deja
exit /b

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
REM Le serveur sort avec 2 si le port est deja pris : le site tourne dans une autre
REM fenetre et la page vient de s'ouvrir dessus, rien a signaler. Tout autre code
REM non nul est une vraie panne.
if errorlevel 3 goto :fin_erreur
if errorlevel 2 (
  echo.
  echo  Le site tourne deja dans une autre fenetre : la page est ouverte dans le navigateur.
  echo.
  pause
  goto :eof
)
if errorlevel 1 goto :fin_erreur
goto :eof

:fin_erreur
echo.
echo  Le script s'est arrete. Copiez le texte de cette fenetre ^(ou une capture d'ecran^)
echo  et envoyez-le a Claude.
echo.
pause
