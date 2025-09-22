require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');

const collection = require('./config');       
const mediaRouter = require('./routes/media');  
const postsRouter = require('./routes/posts');
const Message = require('./models/message');   

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Express setup ---
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));


app.use('/media', mediaRouter);
app.use('/posts', postsRouter);
// Render the feed page
app.get('/feed', (req, res) => {
  if (!req.session.username) return res.redirect('/login');
  res.render('feed', { username: req.session.username });
});

app.get('/', (req, res) => res.render('login'));
app.get('/login', (req, res) => res.render('login'));
app.get('/signup', (req, res) => res.render('signup'));

app.post('/signup', async (req, res) => {
  try {
    const existingUser = await collection.findOne({ email: req.body.email });
    if (existingUser) return res.status(400).send("Email already registered");
    await collection.create({
      name: req.body.username,
      email: req.body.email,
      password: req.body.password
    });
    res.redirect('/login');
  } catch (err) {
    res.status(400).send("Signup failed: " + err.message);
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await collection.findOne({ email });
    if (!user) return res.status(400).send("User not found");
    if (user.password !== password) return res.status(400).send("Invalid password");

    req.session.username = user.name;
    req.session.userEmail = user.email;
    res.redirect('/home');
  } catch (err) {
    res.status(400).send("Login failed: " + err.message);
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});


app.get('/home', (req, res) => {
  if (!req.session.username) return res.redirect('/login');
  res.render('home', { username: req.session.username });
});


io.on('connection', async (socket) => {
  
  const username = socket.handshake.auth?.username || 'Anonymous';
  socket.data.username = username;
  console.log('socket connected:', username);

 
  try {
    const history = await Message.find().sort({ createdAt: 1 }).limit(100).lean();
    socket.emit('loadMessages', history);
  } catch (err) {
    console.error('Error loading chat history', err);
  }

  
  socket.on('sendMessage', async (text) => {
    try {
      if (!text || !text.trim()) return;
      const doc = await Message.create({ sender: socket.data.username, message: text.trim() });
      io.emit('newMessage', {
        _id: doc._id,
        sender: doc.sender,
        message: doc.message,
        createdAt: doc.createdAt
      });
    } catch (err) {
      console.error('Error saving message', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected:', username);
  });
});

// --- Start server ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
