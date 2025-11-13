// simple middleware to ensure the requester is logged in and an admin
module.exports = function isAdmin(req, res, next) {
  try {
    const user = (req.session && req.session.user) || req.user;
    if (!user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    return next();
  } catch (err) {
    return res.status(500).json({ message: 'Internal Server error' });
  }
};