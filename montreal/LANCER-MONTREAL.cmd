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
REM    3. se relance depuis la version du script qui est dans le depot, pour tourner
REM       avec sa propre derniere version sans qu'on ait a le retelecharger ;
REM    4. installe les dependances ;
REM    5. lance la routine (calendrier, decisions, votes, elus, districts...) en ecrivant
REM       tout dans data\lancement.log ;
REM    6. envoie les donnees et le journal sur GitHub ;
REM    7. ouvre le site en local dans le navigateur.
REM
REM  Rien a taper. S'il y a un probleme, la fenetre reste ouverte et dit lequel.
REM  Pour seulement VOIR le site sans rien extraire : VOIR-MONTREAL.cmd.
REM
REM  Trois tours : le fichier double-clique (tour 0) se recopie dans %TEMP% et se
REM  relance (tour 1) ; le tour 1 met le depot a jour, puis relance la copie du depot
REM  (tour 2, argument "deja") qui fait le travail. Chaque tour tourne depuis un fichier
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
set "TOUR=%TEMP%\LANCER-MONTREAL-%RANDOM%%RANDOM%"
md "%TOUR%" 2>nul || if exist "%TOUR%\*" goto :tour_nom
:tour_ok
if /i not "%~1"=="relance" (
  REM Menage : quand on ferme la fenetre, le rd ci-dessous n'est jamais atteint et le
  REM dossier reste. On ne balaie que ceux d'au moins deux jours : une fenetre encore
  REM ouverte peut executer les plus recents.
  forfiles /p "%TEMP%" /m "LANCER-MONTREAL-*" /d -2 /c "cmd /c if @isdir==TRUE rd /s /q @path" >nul 2>nul
  copy /y "%~f0" "%TOUR%\1.cmd" >nul
  if errorlevel 1 (
    echo  [!] Impossible de se recopier dans "%TEMP%".
    goto :fin_erreur
  )
  call "%TOUR%\1.cmd" relance
  rd /s /q "%TOUR%" 2>nul
  exit /b
)

REM ---- Tour 2 : le depot est deja a jour, on passe au travail ---------------------
if /i "%~2"=="deja" goto :travail

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
  echo  [!] Impossible de joindre GitHub. Verifiez la connexion Internet.
  goto :fin_erreur
)
if errorlevel 1 (
  echo  [!] La branche %BRANCHE% n'existe plus sur GitHub.
  echo      Retelechargez LANCER-MONTREAL.cmd, ou demandez a Claude la nouvelle version.
  goto :fin_erreur
)
git fetch origin "%BRANCHE%"
if errorlevel 1 (
  echo  [!] Impossible de joindre GitHub. Verifiez la connexion Internet.
  goto :fin_erreur
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
if not exist "%VOLET%\LANCER-MONTREAL.cmd" goto :travail
copy /y "%VOLET%\LANCER-MONTREAL.cmd" "%TOUR%\2.cmd" >nul
if errorlevel 1 (
  echo  [!] Impossible de recopier le script : on continue avec la version actuelle.
  goto :travail
)
call "%TOUR%\2.cmd" relance deja
exit /b

:travail
REM ---- Les etapes 4 a 6 tournent en tenant le verrou ouvert (descripteur 9) ---------
REM Un VOIR ou un LANCER lance dans une autre fenetre le voit et refuse de remettre le
REM depot a zero sous nos pieds. Il se referme avec la fenetre, meme fermee en plein
REM milieu. Il est rendu AVANT de servir le site, sinon un VOIR serait refuse tant que
REM cette fenetre reste ouverte.
REM Le test du tour 1 date de plusieurs secondes (reseau) : on le refait juste avant la
REM prise, sinon deux LANCER partis ensemble finiraient sur l'erreur brute de cmd.
2>nul ( >>"%VERROU%" (call ) ) || (
  echo  [!] LANCER-MONTREAL.cmd est en train d'extraire des donnees dans une autre fenetre.
  echo      Attendez qu'il affiche "Ouverture du site", puis relancez ce script.
  echo.
  pause
  goto :eof
)
9>"%VERROU%" call :extraction
if errorlevel 1 goto :fin_erreur

REM ---- 7. Le site en local --------------------------------------------------
cd /d "%VOLET%"
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

:extraction
REM ---- 4. Les dependances ---------------------------------------------------
cd /d "%VOLET%"
echo  Dependances ...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo  [!] L'installation des dependances a echoue. Voir les messages ci-dessus.
  exit /b 1
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
REM La routine elle-meme sort toujours avec 0 : une etape en panne est notee dans le
REM bilan et les donnees de la veille sont gardees, c'est voulu.
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
  if errorlevel 1 (
    echo  [!] L'enregistrement local a echoue : rien n'a ete envoye sur GitHub.
    echo      Les donnees sont dans "%VOLET%\data" mais SEULEMENT jusqu'au prochain
    echo      lancement d'un des deux scripts. Copiez ce dossier ailleurs pour les garder.
  ) else (
    git push origin "%BRANCHE%"
    if errorlevel 1 (
      echo  [!] L'envoi sur GitHub a echoue ^(pas d'acces en ecriture depuis ce PC ?^).
      echo      Les donnees sont dans "%VOLET%\data" mais SEULEMENT jusqu'au prochain
      echo      lancement d'un des deux scripts. Copiez ce dossier ailleurs pour les garder.
    ) else (
      echo  Donnees envoyees sur GitHub, branche %BRANCHE%.
    )
  )
) else (
  echo  Aucune nouvelle donnee a envoyer sur GitHub.
)
echo.
exit /b 0

:fin_erreur
echo.
echo  Le script s'est arrete. Copiez le texte de cette fenetre ^(ou une capture d'ecran^)
echo  et envoyez-le a Claude.
echo.
pause
