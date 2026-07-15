-- ============================================================================
-- Bolingo — close the storage-upload underage gap
--
-- Trouvé lors de la revue ciblée de record_underage_attempt() : le blocage
-- mineur avait été ajouté (0002) aux policies des TABLES profiles /
-- profile_photos / likes (0003), mais PAS à la policy d'upload Storage.
-- Un compte flagué pouvait donc encore téléverser des OBJETS bruts dans son
-- dossier (invisibles — aucune ligne profile_photos possible — mais des
-- octets stockés = « données collectées », ce que la garantie légale interdit).
--
-- NB : private.is_underage_blocked — les helpers vivent dans le schéma
-- `private` depuis 0004 (cette migration s'applique après).
--
-- ⚠️ À APPLIQUER PAR L'UTILISATEUR via `supabase db push` (règle CLAUDE.md :
-- aucune écriture sur le projet réel sans confirmation explicite).
-- ============================================================================

drop policy if exists "photos_upload_own_folder" on storage.objects;
create policy "photos_upload_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not private.is_underage_blocked(auth.uid())
  );
