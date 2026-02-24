CREATE POLICY "Public Uploads" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'evidence-videos');
CREATE POLICY "Public Read Access" ON storage.objects FOR SELECT USING (bucket_id = 'evidence-videos');
