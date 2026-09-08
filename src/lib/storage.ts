import { createClient } from '@supabase/supabase-js';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'damage-photos';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Photo storage is not configured yet — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key);
}

// Server-only — uses the service-role key, never send this to the client.
// `folder` namespaces the path (e.g. "damage", "saree") so photos for
// different record types don't collide even if their ids ever did.
export async function uploadPhoto(folder: string, recordId: string, file: File): Promise<string> {
  const supabase = getSupabaseClient();

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const path = `${folder}/${recordId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(arrayBuffer), {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(`Could not upload photo: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
