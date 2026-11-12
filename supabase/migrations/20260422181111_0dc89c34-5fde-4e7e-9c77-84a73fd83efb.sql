-- Drop the broad SELECT policy and re-add a narrower one that allows reading
-- specific files (any non-empty path) but blocks bare LIST/index requests
-- where `name` is null or empty.
DROP POLICY IF EXISTS "Public read broadcast images" ON storage.objects;

CREATE POLICY "Public read individual broadcast images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'broadcast-images'
  AND name IS NOT NULL
  AND length(name) > 0
);