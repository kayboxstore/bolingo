-- ============================================================================
-- Bolingo — suppression de compte (RGPD) + purge des preuves de signalement
--
-- ⚠️ FICHIER UNIQUEMENT : à appliquer par l'utilisateur via `supabase db push`.
--
-- Ce fichier ne contient QUE des fonctions (droit à l'effacement, obligatoire).
-- La planification pg_cron de la purge vit dans 0011 (dépendance d'infra
-- optionnelle) pour ne pas coupler l'effacement RGPD à la disponibilité de
-- pg_cron : un échec de l'extension ne doit pas empêcher delete_own_account.
--
-- Réutilise l'existant :
--   * account_status='deleted' (0001) est DÉJÀ traité comme 'suspended' partout :
--     user_is_active() teste status='active' (0002) → caller_active() coupe
--     l'accès d'un compte deleted immédiatement.
--   * l'écriture de status est déjà verrouillée (revoke update users 0002 ; seul
--     last_active_at accordé) → 'deleted' est aussi inécrivable côté client que
--     'suspended'. Seule la RPC delete_own_account (DEFINER) le pose.
--   * delete_own_account suit le pattern de record_underage_attempt (0002).
-- ============================================================================

-- set_updated_at (0001) réécrit updated_at=now() sur TOUT update. On l'enseigne
-- à respecter un drapeau de session `bolingo.skip_touch` : la purge s'en sert
-- pour ne pas écraser la date de résolution des signalements qu'elle nettoie
-- (sinon updated_at, censé refléter la résolution, dériverait vers la date de
-- purge). Défaut absent → comportement inchangé partout ailleurs.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('bolingo.skip_touch', true), '') = 'on' then
    return new;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------- delete_own_account()
-- Suppression douce + scrub PII, pour l'appelant uniquement. Idempotent :
-- rejouable sans effet de bord (colonnes déjà nulles / lignes déjà supprimées).
-- Ce que la fonction NE fait pas : supprimer les objets Storage (fait par la
-- server action avec la session user) ni scruber auth.users (fait par la server
-- action via le client service-role — on ne peut pas hard-delete auth.users : la
-- cascade casserait matches/messages).
create or replace function public.delete_own_account()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Scrub des PII de compte ; on garde la ligne users (FK matches/messages/
  -- reports) et l'id. status='deleted' coupe l'accès via caller_active().
  -- last_active_at nullé (métadonnée d'usage) ; created_at conservé (non
  -- identifiant, utile à l'intégrité).
  update public.users
     set email          = null,
         phone          = null,
         last_active_at = null,
         status         = 'deleted',
         deleted_at     = coalesce(deleted_at, now())
   where id = auth.uid();

  -- Clôture les matches actifs de l'appelant → le pair ne peut plus écrire dans
  -- une conversation morte (messages_insert exige un match actif, 0007) et la
  -- conversation quitte sa liste. Les LIGNES matches/messages sont CONSERVÉES :
  -- choix spec — les messages envoyés à d'autres ne sont pas scrubés (intérêt
  -- légitime du destinataire, ne casse pas son expérience). De même
  -- likes/match_reads/blocks (pseudonymes, non identifiants une fois le profil
  -- effacé, utiles à l'intégrité) ne sont pas supprimés.
  update public.matches
     set status = 'unmatched'
   where (user_a = auth.uid() or user_b = auth.uid())
     and status = 'active';

  -- Efface tout le PII de profil (nom, bio, date de naissance, genre,
  -- orientation, ville, localisation, photos). Rien ne FK-référence profiles
  -- (matches/messages pointent sur users) → suppression sûre. Les autres voient
  -- « Profil indisponible » (profile_available=false).
  delete from public.profile_photos where user_id = auth.uid();
  delete from public.profiles where user_id = auth.uid();
end;
$$;
revoke all on function public.delete_own_account() from public;
revoke execute on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;

-- ---------------------------------------------------- purge_report_evidence()
-- Purge le contenu privé conservé sur les signalements CLOS depuis > 90 jours :
-- le snapshot de preuve (evidence_content, 0009) ET le texte libre du rapporteur
-- (details, qui peut contenir des données personnelles sur le signalé). On garde
-- category/reason (catégorie, non identifiante — utile aux stats de modération).
-- Rétention 90 j après résolution : fenêtre suffisante pour un recours / une
-- ré-ouverture de dossier, tout en bornant la conservation (minimisation RGPD).
-- Les signalements encore open/reviewing ne sont JAMAIS purgés, quelle que soit
-- leur ancienneté.
--
-- Non exposée aux utilisateurs : revoke total. Seul le job pg_cron (rôle
-- propriétaire) l'exécute — un appel PostgREST par un client échoue.
create or replace function public.purge_report_evidence()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Ne pas réécrire updated_at (il doit continuer de refléter la résolution).
  perform set_config('bolingo.skip_touch', 'on', true);  -- local à la transaction
  update public.reports
     set evidence_content = null,
         details = null
   where (evidence_content is not null or details is not null)
     and status in ('resolved', 'dismissed')
     and updated_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.purge_report_evidence() from public, anon, authenticated;

-- Index partiel dédié à la purge : borné aux signalements clos encore porteurs
-- de contenu, ordonné par updated_at → le job nocturne ne scanne pas tout
-- l'historique des reports clos (les lignes sortent de l'index une fois purgées).
create index if not exists reports_purge_candidates_idx
  on public.reports (updated_at)
  where status in ('resolved', 'dismissed')
    and (evidence_content is not null or details is not null);
