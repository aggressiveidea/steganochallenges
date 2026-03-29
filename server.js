const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_stegano_key_change_me_in_prod';

app.use(cors());
app.use(express.json());
app.use('/challenges', express.static('challenges'));
app.use(express.static('.'));

// Initialize SQLite Database (better-sqlite3 is synchronous)
const db = new Database('./stegano.db');
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    score INTEGER DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS solves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    challenge_id INTEGER,
    points_awarded INTEGER DEFAULT 0,
    first_blood INTEGER DEFAULT 0,
    solved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
)`);

console.log('Connected to the SQLite database.');

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- AUTHENTICATION ROUTES ---

app.post('/api/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Discord username required' });

    try {
        let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

        if (user) {
            const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
            return res.json({ token, username: user.username });
        } else {
            const result = db.prepare('INSERT INTO users (username) VALUES (?)').run(username);
            const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '24h' });
            return res.status(201).json({ token, username });
        }
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/me', authenticateToken, (req, res) => {
    try {
        const rows = db.prepare('SELECT challenge_id FROM solves WHERE user_id = ?').all(req.user.id);
        res.json({ username: req.user.username, solved: rows.map(r => r.challenge_id) });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// --- GAME ROUTES ---

const FIRST_BLOOD_BONUS = 50;

const challenges = [
    { id: 1, flag: process.env.FLAG_1, basePoints: 100,  decrement: 8,  minPercent: 0.25 },
    { id: 2, flag: process.env.FLAG_2, basePoints: 250,  decrement: 15, minPercent: 0.25 },
    { id: 3, flag: process.env.FLAG_3, basePoints: 300,  decrement: 20, minPercent: 0.25 },
    { id: 4, flag: process.env.FLAG_4, basePoints: 100,  decrement: 8,  minPercent: 0.25 }
];

function calcPoints(challenge, solveCount) {
    const minPoints = Math.floor(challenge.basePoints * challenge.minPercent);
    return Math.max(challenge.basePoints - (solveCount * challenge.decrement), minPoints);
}

app.post('/api/submit', authenticateToken, (req, res) => {
    const { challengeId, flag } = req.body;
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    if (challenge.flag !== flag) return res.status(400).json({ error: 'Incorrect flag! Keep digging.', correct: false });

    try {
        const existing = db.prepare('SELECT * FROM solves WHERE user_id = ? AND challenge_id = ?').get(req.user.id, challengeId);
        if (existing) return res.status(400).json({ error: 'Already solved this case.', correct: true });

        const { count: solveCount } = db.prepare('SELECT COUNT(*) as count FROM solves WHERE challenge_id = ?').get(challengeId);
        const isFirstBlood = solveCount === 0;
        const pointsEarned = calcPoints(challenge, solveCount) + (isFirstBlood ? FIRST_BLOOD_BONUS : 0);

        db.prepare('INSERT INTO solves (user_id, challenge_id, points_awarded, first_blood) VALUES (?, ?, ?, ?)').run(req.user.id, challengeId, pointsEarned, isFirstBlood ? 1 : 0);
        db.prepare('UPDATE users SET score = score + ? WHERE id = ?').run(pointsEarned, req.user.id);

        res.json({
            message: isFirstBlood
                ? `🩸 FIRST BLOOD! +${pointsEarned} pts (includes +${FIRST_BLOOD_BONUS} first blood bonus)`
                : `Flag correct! +${pointsEarned} pts`,
            correct: true,
            points: pointsEarned,
            firstBlood: isFirstBlood
        });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/leaderboard', (req, res) => {
    try {
        const rows = db.prepare('SELECT username, score FROM users ORDER BY score DESC LIMIT 10').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/challenges', (req, res) => {
    try {
        const rows = db.prepare('SELECT challenge_id, COUNT(*) as solveCount FROM solves GROUP BY challenge_id').all();
        const solveCounts = {};
        rows.forEach(r => { solveCounts[r.challenge_id] = r.solveCount; });

        const info = challenges.map(c => ({
            id: c.id,
            currentPoints: calcPoints(c, solveCounts[c.id] || 0),
            basePoints: c.basePoints,
            solves: solveCounts[c.id] || 0
        }));
        res.json(info);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
