const express = require('express');
const router = express.Router();
const multer = require('multer');
const os = require('os');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  listUsers, createUser, getUser, updateUser, deleteUser,
  updateProfile, changePassword, uploadAvatar,
} = require('../controllers/userController');

const avatarUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

// Profile operations (for self)
router.get('/me', authenticateToken, (req, res) => {
  req.params.id = req.user.id;
  return getUser(req, res);
});
router.put('/me/profile', authenticateToken, updateProfile);
router.put('/me/password', authenticateToken, changePassword);
router.post('/me/avatar', authenticateToken, avatarUpload.single('avatar'), uploadAvatar);

// Admin-only user management
router.get('/', authenticateToken, requireAdmin, listUsers);
router.post('/', authenticateToken, requireAdmin, createUser);
router.get('/:id', authenticateToken, requireAdmin, getUser);
router.put('/:id', authenticateToken, requireAdmin, updateUser);
router.delete('/:id', authenticateToken, requireAdmin, deleteUser);

module.exports = router;
