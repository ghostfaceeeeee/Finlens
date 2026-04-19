/**
 * server/routes/watchlist.js
 * CRUD favorit aset per user.
 * GET /    - ambil semua watchlist user
 * POST /   - tambah aset ke watchlist
 * PUT /:id - update notes
 * DELETE /:id - hapus dari watchlist
 * PUT /:id/order - ubah urutan
 */
const { Router } = require('express');
const { watchlist, assets } = require('../db/queries');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// Semua route membutuhkan login
router.use(requireAuth);

// GET: semua watchlist user ini
router.get('/', (req, res) => {
  const list = watchlist.getByUser(req.user.id);
  res.json({ watchlist: list, count: list.length });
});

// POST: tambah aset ke watchlist
router.post('/', (req, res) => {
  const { asset_id, notes } = req.body;
  if (!asset_id) return res.status(400).json({ error: 'asset_id wajib diisi.' });

  const asset = assets.getById(asset_id);
  if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan.' });

  if (watchlist.isInWatchlist(req.user.id, asset_id))
    return res.status(409).json({ error: `${asset.symbol} sudah ada di watchlist.` });

  const result = watchlist.add(req.user.id, asset_id, notes);
  if (result.changes === 0)
    return res.status(409).json({ error: 'Aset sudah ada di watchlist.' });

  res.status(201).json({
    message: `${asset.name} ditambahkan ke watchlist!`,
    id: result.lastInsertRowid,
  });
});

// PUT: update notes
router.put('/:id', (req, res) => {
  const { notes } = req.body;
  const result = watchlist.updateNotes(req.user.id, req.params.id, notes || null);
  if (result.changes === 0)
    return res.status(404).json({ error: 'Item tidak ditemukan.' });
  res.json({ message: 'Catatan diperbarui.' });
});

// DELETE: hapus dari watchlist
router.delete('/:id', (req, res) => {
  const result = watchlist.remove(req.user.id, req.params.id);
  if (result.changes === 0)
    return res.status(404).json({ error: 'Item tidak ditemukan.' });
  res.json({ message: 'Dihapus dari watchlist.' });
});

// PUT: ubah urutan
router.put('/:id/order', (req, res) => {
  const { order } = req.body;
  if (order === undefined) return res.status(400).json({ error: 'order wajib diisi.' });
  watchlist.reorder(req.user.id, req.params.id, order);
  res.json({ message: 'Urutan diperbarui.' });
});

module.exports = router;
