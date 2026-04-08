-- Tornar buckets privados (documentos só acessíveis via signed URL)
UPDATE storage.buckets SET public = false WHERE id IN ('ocorrencias-documentos', 'portal-documentos');

-- Policy para signed URL: só usuários autenticados no sistema OU sessão do portal
-- Para o portal (anon key), precisamos de uma policy que valida a sessão
CREATE POLICY IF NOT EXISTS "download_autenticado_ocorrencias" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'ocorrencias-documentos' AND auth.role() = 'authenticated'
  );

CREATE POLICY IF NOT EXISTS "download_autenticado_portal" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'portal-documentos' AND auth.role() = 'authenticated'
  );
