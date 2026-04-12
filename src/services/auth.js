import { supabase, isSupabaseConfigured } from '../config/supabase';

// When Supabase isn't configured we simulate a local user so Satvik can
// walk through the whole app end-to-end.
function makeMockUser({ email, name, phone, city, zip, role }) {
  return {
    id: 'mock-user-1',
    email: email || 'demo@betternature.app',
    name: name || 'Demo User',
    phone: phone || '',
    city: city || '',
    zip: zip || '',
    role: role || 'member',
    chapter_id: 'ch-memphis',
  };
}

export async function signUp({ email, password, name, phone, city, zip, role }) {
  if (!isSupabaseConfigured) {
    const user = makeMockUser({ email, name, phone, city, zip, role });
    return { user, session: { user } };
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
    },
  });
  if (authError) throw authError;

  // The trigger handle_new_user() auto-creates the profile row. We just
  // need to fill in the extra fields the trigger doesn't know about.
  if (authData.user) {
    await supabase
      .from('users')
      .update({ name, phone, city, zip, role: role || 'member' })
      .eq('id', authData.user.id);
  }

  // Return the full profile so the caller has role + chapter_id immediately.
  const profile = authData.user
    ? await getProfile(authData.user.id)
    : null;
  return {
    user: profile || authData.user,
    session: authData.session,
  };
}

export async function signIn({ email, password, role }) {
  if (!isSupabaseConfigured) {
    const user = makeMockUser({ email, role });
    return { user, session: { user } };
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;

  // Hydrate the full profile (role, chapter_id, stats) from the users table
  // so the app can route to the correct portal immediately.
  const profile = data.user ? await getProfile(data.user.id) : null;
  return {
    user: profile || data.user,
    session: data.session,
  };
}

export async function signOut() {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getProfile(userId) {
  if (!isSupabaseConfigured) return makeMockUser({});
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId, updates) {
  if (!isSupabaseConfigured) return { ...makeMockUser({}), ...updates };
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function uploadIdDocument(userId, fileUri) {
  if (!isSupabaseConfigured) return fileUri;
  const fileName = `id-docs/${userId}-${Date.now()}.jpg`;
  const response = await fetch(fileUri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(fileName, blob, { contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('documents')
    .getPublicUrl(fileName);

  await supabase
    .from('users')
    .update({ id_document_url: urlData.publicUrl })
    .eq('id', userId);

  return urlData.publicUrl;
}

export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
