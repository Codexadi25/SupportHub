const jwt = require('jsonwebtoken');

const generateToken = (res, userId, username, role) => {
  const token = jwt.sign({ userId, username, role }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });

  return token;
};

module.exports = generateToken;
