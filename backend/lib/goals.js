import { supabase } from './supabase.js';

// Goals in a space, for matching a "save X for <goal>" message.
export async function goalsForSpace(spaceId) {
  const { data, error } = await supabase.from('goals').select('id, name').eq('space_id', spaceId);
  if (error) throw new Error(error.message);
  return data || [];
}

// Best-effort match of a parsed goal name to one of the user's goals.
export function matchGoal(goals, name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  return (
    goals.find((g) => g.name.toLowerCase() === n) ||
    goals.find((g) => g.name.toLowerCase().includes(n) || n.includes(g.name.toLowerCase())) ||
    null
  );
}

// Add to a goal's saved amount (a savings transaction feeds goal progress).
export async function addToGoal(goalId, delta, spaceId) {
  if (!goalId || !delta) return;
  const { data: g } = await supabase
    .from('goals')
    .select('current_amount')
    .eq('id', goalId)
    .eq('space_id', spaceId)
    .maybeSingle();
  if (!g) return;
  const next = Math.max(0, Number(g.current_amount) + delta);
  await supabase.from('goals').update({ current_amount: next }).eq('id', goalId).eq('space_id', spaceId);
}
