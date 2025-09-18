import { createClient } from './supabase'

export const signInWithProvider = async (provider: 'google' | 'github') => {
  const supabase = createClient()
  
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })

  if (error) {
    throw error
  }
}

export const signOut = async () => {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  
  if (error) {
    throw error
  }
}