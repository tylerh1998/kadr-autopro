import { supabase } from "@/lib/supabase";

const PROJECT_PHOTO_BUCKET = "project-photos";

function generateRecordId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export async function uploadProjectPhoto(projectId, userId, uploadedBy, file) {
  const fileExt = file.name.split('.').pop();
  const path = `${projectId}/${generateRecordId()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from(PROJECT_PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg" });
    
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("ProjectPhoto")
    .insert({ project_id: projectId, storage_path: path, user_id: userId, uploaded_by: uploadedBy })
    .select("*")
    .single();
    
  if (error) throw error;
  return data;
}

export async function fetchProjectPhotos(projectId) {
  const { data, error } = await supabase
    .from("ProjectPhoto")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
    
  if (error) throw error;
  return data || [];
}

export async function getSignedProjectPhotoUrl(path) {
  const { data, error } = await supabase.storage.from(PROJECT_PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export async function deleteProjectPhoto(photo) {
  await supabase.storage.from(PROJECT_PHOTO_BUCKET).remove([photo.storage_path]);
  const { error } = await supabase.from("ProjectPhoto").delete().eq("id", photo.id);
  if (error) throw error;
}
