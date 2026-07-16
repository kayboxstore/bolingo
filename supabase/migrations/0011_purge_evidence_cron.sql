-- ============================================================================
-- Bolingo — planification de la purge des preuves de signalement (pg_cron)
--
-- ⚠️ FICHIER UNIQUEMENT. SÉPARÉ de 0010 À DESSEIN : pg_cron est une dépendance
-- d'infrastructure OPTIONNELLE (doit être dans shared_preload_libraries au
-- niveau instance). Si cette migration échoue (extension indisponible sur ce
-- projet), elle ne doit PAS empêcher le déploiement de delete_own_account /
-- purge_report_evidence (0010, effacement RGPD obligatoire).
--
-- Si pg_cron n'est pas activé : l'activer une fois via le Dashboard Supabase
-- (Database → Extensions → pg_cron), puis rejouer ce fichier. En attendant, la
-- purge peut être déclenchée manuellement : `select public.purge_report_evidence();`
-- (rôle service-role / postgres — la fonction est revoke-all pour les clients).
-- ============================================================================

create extension if not exists pg_cron;

-- Idempotent : dé-planifie l'ancien job homonyme avant de re-planifier
-- (cron.schedule crée sinon un doublon sur les versions < 1.4 sans upsert).
do $$
begin
  perform cron.unschedule('purge-report-evidence');
exception
  when others then null;  -- pas encore planifié : rien à défaire
end;
$$;

-- Tous les jours à 03:17 UTC (heure creuse, minute décalée pour éviter la ruée
-- de minuit). Bornée par l'index partiel reports_purge_candidates_idx (0010).
select cron.schedule(
  'purge-report-evidence',
  '17 3 * * *',
  $$select public.purge_report_evidence()$$
);
