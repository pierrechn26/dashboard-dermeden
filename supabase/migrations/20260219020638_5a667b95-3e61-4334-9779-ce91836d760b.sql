-- Create storage bucket for CSV imports
INSERT INTO storage.buckets (id, name, public) VALUES ('csv-imports', 'csv-imports', true);

-- Allow public read access
CREATE POLICY "Public read access for csv-imports"
ON storage.objects
FOR SELECT
USING (bucket_id = 'csv-imports');

-- Allow service role to upload
CREATE POLICY "Service role upload for csv-imports"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'csv-imports');
