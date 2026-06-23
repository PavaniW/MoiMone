import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { listUserCategories, PROTECTED_CATEGORY } from '../lib/categories.js';

const router = Router();

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// Clean a user-supplied category name.
function cleanName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

// GET /api/categories — this user's categories (seeded with defaults on first
// access), name-sorted.
router.get('/', async (req, res, next) => {
  try {
    const cats = await listUserCategories(req.user.id);
    res.json(cats);
  } catch (err) {
    next(err);
  }
});

// POST /api/categories — create a category { name, icon?, color? }.
router.post('/', async (req, res, next) => {
  try {
    const name = cleanName(req.body?.name);
    if (!name) throw badRequest('name is required');
    if (name.length > 40) throw badRequest('name is too long (max 40 chars)');

    const { data, error } = await supabase
      .from('categories')
      .insert({
        name,
        icon: req.body?.icon || null,
        color: req.body?.color || null,
        user_id: req.user.id,
      })
      .select('id, name, icon, color')
      .single();
    if (error) {
      if (error.code === '23505') throw badRequest('a category with that name already exists');
      throw new Error(error.message);
    }
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/categories/:id — rename / restyle. Renaming also relabels this
// user's existing transactions and budgets so their data stays consistent.
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Load the current row (and confirm ownership).
    const { data: current, error: findErr } = await supabase
      .from('categories')
      .select('id, name, icon, color')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!current) throw badRequest('category not found');

    const patch = {};
    let renamedFrom = null;

    if (req.body?.name !== undefined) {
      const name = cleanName(req.body.name);
      if (!name) throw badRequest('name cannot be empty');
      if (name.length > 40) throw badRequest('name is too long (max 40 chars)');
      if (current.name === PROTECTED_CATEGORY && name !== PROTECTED_CATEGORY) {
        throw badRequest(`"${PROTECTED_CATEGORY}" can't be renamed — it's the fallback category`);
      }
      if (name !== current.name) {
        patch.name = name;
        renamedFrom = current.name;
      }
    }
    if (req.body?.icon !== undefined) patch.icon = req.body.icon || null;
    if (req.body?.color !== undefined) patch.color = req.body.color || null;

    if (!Object.keys(patch).length) return res.json(current);

    const { data, error } = await supabase
      .from('categories')
      .update(patch)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select('id, name, icon, color')
      .single();
    if (error) {
      if (error.code === '23505') throw badRequest('a category with that name already exists');
      throw new Error(error.message);
    }

    // Cascade the rename onto this user's own transactions + budgets.
    if (renamedFrom) {
      await supabase
        .from('transactions')
        .update({ category: patch.name })
        .eq('created_by', req.user.id)
        .eq('category', renamedFrom);
      await supabase
        .from('budgets')
        .update({ category: patch.name })
        .eq('created_by', req.user.id)
        .eq('category', renamedFrom);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/categories/:id — remove a category. "Other" is protected (it's
// the parser fallback). Existing transactions keep their text label.
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: current, error: findErr } = await supabase
      .from('categories')
      .select('id, name')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!current) throw badRequest('category not found');
    if (current.name === PROTECTED_CATEGORY) {
      throw badRequest(`"${PROTECTED_CATEGORY}" can't be deleted — it's the fallback category`);
    }

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);
    if (error) throw new Error(error.message);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
