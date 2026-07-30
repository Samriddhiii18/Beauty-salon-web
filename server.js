const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
const galleryDir = path.join(__dirname, 'gallery');

[dataDir, uploadsDir, galleryDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ====== FILE-BASED STORAGE HELPERS ======
function readData(filename) {
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return null; }
}

function writeData(filename, data) {
  fs.writeFileSync(path.join(dataDir, filename), JSON.stringify(data, null, 2));
}

// Initialize default data
function initData() {
  // Users
  if (!readData('users.json')) {
    writeData('users.json', {
      admin: { password: 'admin123', role: 'admin' },
      customer: { password: 'customer123', role: 'customer' }
    });
  }
  // Reviews
  if (!readData('reviews.json')) writeData('reviews.json', []);
  // Requests
  if (!readData('requests.json')) writeData('requests.json', []);
  // Gallery images (metadata)
  if (!readData('gallery.json')) writeData('gallery.json', []);
  // Offers
  if (!readData('offers.json')) {
    writeData('offers.json', {
      'Skin Services': ['1 Fruit facial free on 3+ facials', '1 Gold facial free on 3 Gold facials', '1 Fruit facial free on 3 Fruit Facials', '25% OFF on 3+ D-Tans'],
      'Hair Services': ['25% OFF on Advanced Haircut', '25% OFF on hair spa', '25% OFF on Hair Spa treatment', '25% OFF on Hair highlighting', '25% OFF on Hair Global Color', '25% OFF on Permanent & Temporary Hair straightening'],
      'Makeup Offers': ['1 Party Makeup free on a Bridal Makeup', '25% OFF on Engagement Makeup', '10% OFF on Party Makeup']
    });
  }
  // Rewards
  if (!readData('rewards.json')) {
    writeData('rewards.json', {
      pointsPerService: { 'hair-services': 50, 'bleach': 20, 'threading': 10, 'facial': 40, 'waxing': 30, 'makeup': 100, 'body-polishing': 80 },
      thresholds: [{ points: 100, discount: 5 }, { points: 250, discount: 10 }, { points: 500, discount: 20 }],
      customerPoints: {},
      customerHistory: {}
    });
  }
  // Sessions (active login tokens)
  if (!readData('sessions.json')) writeData('sessions.json', {});
}
initData();

// ====== MULTER FOR FILE UPLOADS (Gallery) ======
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, galleryDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).substring(2, 8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ====== API ROUTES ======

// --- Session (Login/Logout) ---
app.post('/api/login', (req, res) => {
  const { username, password, role } = req.body;
  const users = readData('users.json');
  if (users[username] && users[username].password === password && users[username].role === role) {
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const sessions = readData('sessions.json');
    sessions[token] = { username, role };
    writeData('sessions.json', sessions);
    return res.json({ success: true, token, username, role });
  }
  return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

app.post('/api/signup', (req, res) => {
  const { username, password, role, adminCode } = req.body;
  if (role === 'admin' && adminCode !== 'Gwg#99') {
    return res.status(403).json({ success: false, message: 'Invalid admin code' });
  }
  const users = readData('users.json');
  if (users[username]) {
    return res.status(409).json({ success: false, message: 'Username already exists' });
  }
  users[username] = { password, role };
  writeData('users.json', users);

  const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
  const sessions = readData('sessions.json');
  sessions[token] = { username, role };
  writeData('sessions.json', sessions);
  return res.json({ success: true, token, username, role });
});

app.post('/api/logout', (req, res) => {
  const { token } = req.body;
  const sessions = readData('sessions.json');
  delete sessions[token];
  writeData('sessions.json', sessions);
  res.json({ success: true });
});

app.post('/api/verify', (req, res) => {
  const { token } = req.body;
  const sessions = readData('sessions.json');
  if (sessions[token]) {
    return res.json({ success: true, ...sessions[token] });
  }
  return res.status(401).json({ success: false });
});

// --- Users list (for admin rewards) ---
app.get('/api/users', (req, res) => {
  const users = readData('users.json');
  const customers = {};
  const rewards = readData('rewards.json');
  Object.keys(users).forEach(u => {
    if (users[u].role === 'customer') {
      customers[u] = { role: 'customer', points: rewards.customerPoints[u] || 0 };
    }
  });
  res.json(customers);
});

// --- Reviews ---
app.get('/api/reviews', (req, res) => {
  const reviews = readData('reviews.json');
  res.json(reviews);
});

app.post('/api/reviews', (req, res) => {
  const { token, author, rating, text } = req.body;
  if (!token || !author || !rating || !text) return res.status(400).json({ success: false });
  const sessions = readData('sessions.json');
  if (!sessions[token]) return res.status(401).json({ success: false });

  const reviews = readData('reviews.json');
  const newReview = {
    id: Date.now(),
    author,
    rating,
    text,
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  };
  reviews.unshift(newReview);
  writeData('reviews.json', reviews);
  res.json({ success: true, review: newReview });
});

// --- Callback Requests ---
app.get('/api/requests', (req, res) => {
  const requests = readData('requests.json');
  res.json(requests);
});

app.post('/api/requests', (req, res) => {
  const { token, name, phone, service, message, from } = req.body;
  if (!token || !name || !phone) return res.status(400).json({ success: false });
  const sessions = readData('sessions.json');
  if (!sessions[token]) return res.status(401).json({ success: false });

  const requests = readData('requests.json');
  const newReq = {
    id: Date.now(),
    name, phone, service: service || 'Not specified',
    message: message || '—',
    from: from || sessions[token].username,
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  };
  requests.push(newReq);
  writeData('requests.json', requests);
  res.json({ success: true, request: newReq });
});

// --- Gallery ---
app.get('/api/gallery', (req, res) => {
  const galleryDir2 = path.join(__dirname, 'gallery');
  if (!fs.existsSync(galleryDir2)) { fs.mkdirSync(galleryDir2, { recursive: true }); return res.json([]); }
  const files = fs.readdirSync(galleryDir2).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
  const images = files.map(f => ({
    filename: f,
    url: '/gallery/' + f,
    id: f
  }));
  res.json(images);
});

app.post('/api/gallery/upload', upload.array('images', 20), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'No files' });
  const files = req.files.map(f => ({ filename: f.filename, url: '/gallery/' + f.filename }));
  res.json({ success: true, files });
});

app.post('/api/gallery/delete', (req, res) => {
  const { filenames } = req.body;
  if (!filenames || !Array.isArray(filenames)) return res.status(400).json({ success: false });
  filenames.forEach(f => {
    const fp = path.join(galleryDir, f);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  res.json({ success: true });
});

// --- Offers ---
app.get('/api/offers', (req, res) => {
  const offers = readData('offers.json');
  res.json(offers);
});

app.post('/api/offers', (req, res) => {
  const { category, text } = req.body;
  if (!category || !text) return res.status(400).json({ success: false });
  const offers = readData('offers.json');
  if (!offers[category]) offers[category] = [];
  offers[category].push(text);
  writeData('offers.json', offers);
  res.json({ success: true, offers });
});

app.post('/api/offers/delete', (req, res) => {
  const { category, index } = req.body;
  const offers = readData('offers.json');
  if (offers[category] && offers[category][index] !== undefined) {
    offers[category].splice(index, 1);
    writeData('offers.json', offers);
  }
  res.json({ success: true, offers });
});

// --- Rewards ---
app.get('/api/rewards', (req, res) => {
  const rewards = readData('rewards.json');
  res.json(rewards);
});

app.post('/api/rewards/points-service', (req, res) => {
  const { category, points } = req.body;
  const rewards = readData('rewards.json');
  rewards.pointsPerService[category] = points;
  writeData('rewards.json', rewards);
  res.json({ success: true, rewards });
});

app.post('/api/rewards/threshold', (req, res) => {
  const { points, discount } = req.body;
  const rewards = readData('rewards.json');
  rewards.thresholds.push({ points, discount });
  writeData('rewards.json', rewards);
  res.json({ success: true, rewards });
});

app.post('/api/rewards/threshold/delete', (req, res) => {
  const { index } = req.body;
  const rewards = readData('rewards.json');
  if (rewards.thresholds[index] !== undefined) {
    rewards.thresholds.splice(index, 1);
    writeData('rewards.json', rewards);
  }
  res.json({ success: true, rewards });
});

app.post('/api/rewards/customer', (req, res) => {
  const { username, type, points, description } = req.body;
  if (!username || !points) return res.status(400).json({ success: false });
  const rewards = readData('rewards.json');
  if (!rewards.customerPoints[username]) rewards.customerPoints[username] = 0;
  if (!rewards.customerHistory[username]) rewards.customerHistory[username] = [];

  if (type === 'add') rewards.customerPoints[username] += points;
  else rewards.customerPoints[username] = Math.max(0, rewards.customerPoints[username] - points);

  rewards.customerHistory[username].push({
    pts: type === 'add' ? '+' + points : '-' + points,
    desc: description || (type === 'add' ? 'Admin added points' : 'Admin subtracted points'),
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  });
  writeData('rewards.json', rewards);
  res.json({ success: true, rewards });
});

app.post('/api/rewards/redeem', (req, res) => {
  const { username, points, discount } = req.body;
  const rewards = readData('rewards.json');
  if ((rewards.customerPoints[username] || 0) < points) {
    return res.status(400).json({ success: false, message: 'Not enough points' });
  }
  rewards.customerPoints[username] -= points;
  if (!rewards.customerHistory[username]) rewards.customerHistory[username] = [];
  rewards.customerHistory[username].push({
    pts: '-' + points,
    desc: 'Redeemed ' + discount + '% OFF voucher',
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  });
  writeData('rewards.json', rewards);
  res.json({ success: true, rewards });
});

// ====== SERVE FRONTEND ======
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'beauty-salon-complete.html'));
});

app.listen(PORT, () => {
  console.log(`Beauty Salon server running at http://localhost:${PORT}`);
});
