#!/bin/sh
# Étape « Ignored Build Step » de Vercel (vercel.json → ignoreCommand, qui refuse plus de 256
# caractères : la commande vit donc ici). Code 0 : pas de déploiement. Code 1 : déploiement.
#
# Un commit qui ne change que des README, des scripts, des scrapers, des tests ou les workflows
# ne change rien au site servi : on ne redéploie pas (chaque déploiement garde ~45 Mo dans les
# 10 Go du forfait gratuit). Comparé au dernier déploiement réussi ; si git ne le trouve pas
# (clone partiel), git échoue et on déploie par prudence.

git diff --quiet "${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}" HEAD -- . \
  ':(exclude,glob)**/*.md' \
  ':(exclude,glob)**/scripts/**' \
  ':(exclude,glob)**/scrapers/**' \
  ':(exclude,glob)*/lib/**' \
  ':(exclude,glob)**/test/**' \
  ':(exclude,glob).github/**' \
  ':(exclude,glob)*/package.json' \
  ':(exclude,glob)*/package-lock.json' \
  ':(exclude,glob)**/*.cmd' || exit 1
