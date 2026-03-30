const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_stegano_key_change_me_in_prod';

app.use(cors());
app.use(express.json());
app.use('/challenges', express.static('challenges'));
app.use(express.static('.'));

// --- DATABASE ABSTRACTION ---
let db;
const isPostgres = !!process.env.DATABASE_URL;

if (isPostgres) {
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    console.log('Using PostgreSQL database.');
} else {
    db = new Database('./stegano.db');
    db.pragma('journal_mode = WAL');
    console.log('Using SQLite database.');
}

async function query(text, params) {
    if (isPostgres) {
        return await db.query(text, params);
    } else {
        // Convert $1, $2 to ? for SQLite
        const sqliteText = text.replace(/\$\d+/g, '?');
        const stmt = db.prepare(sqliteText);
        if (text.trim().toUpperCase().startsWith('SELECT')) {
            const rows = stmt.all(params || []);
            return { rows };
        } else {
            const result = stmt.run(params || []);
            return { rowCount: result.changes, lastId: result.lastInsertRowid };
        }
    }
}

// Initialize Tables
async function initDB() {
    await query(`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        score INTEGER DEFAULT 0
    )`.replace('SERIAL PRIMARY KEY', isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'));

    await query(`CREATE TABLE IF NOT EXISTS solves (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        challenge_id INTEGER,
        points_awarded INTEGER DEFAULT 0,
        first_blood INTEGER DEFAULT 0,
        solved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`.replace('SERIAL PRIMARY KEY', isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'));
}

initDB().catch(console.error);

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

app.post('/api/login', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Discord username required' });

    try {
        let result = await query('SELECT * FROM users WHERE username = $1', [username]);
        let user = result.rows[0];

        if (user) {
            const token = jwt.sign({ id: user.id || user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
            return res.json({ token, username: user.username });
        } else {
            const insertResult = await query('INSERT INTO users (username) VALUES ($1)', [username]);
            const newId = isPostgres 
                ? (await query('SELECT id FROM users WHERE username = $1', [username])).rows[0].id
                : insertResult.lastId;
            const token = jwt.sign({ id: newId, username }, JWT_SECRET, { expiresIn: '24h' });
            return res.status(201).json({ token, username });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const result = await query('SELECT challenge_id FROM solves WHERE user_id = $1', [req.user.id]);
        res.json({ username: req.user.username, solved: result.rows.map(r => r.challenge_id) });
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

app.post('/api/submit', authenticateToken, async (req, res) => {
    const { challengeId, flag } = req.body;
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    if (challenge.flag !== flag) return res.status(400).json({ error: 'Incorrect flag! Keep digging.', correct: false });

    try {
        const existing = await query('SELECT * FROM solves WHERE user_id = $1 AND challenge_id = $2', [req.user.id, challengeId]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Already solved this case.', correct: true });

        const countResult = await query('SELECT COUNT(*) as count FROM solves WHERE challenge_id = $1', [challengeId]);
        const solveCount = parseInt(countResult.rows[0].count);
        const isFirstBlood = solveCount === 0;
        const pointsEarned = calcPoints(challenge, solveCount) + (isFirstBlood ? FIRST_BLOOD_BONUS : 0);

        await query('INSERT INTO solves (user_id, challenge_id, points_awarded, first_blood) VALUES ($1, $2, $3, $4)', 
                    [req.user.id, challengeId, pointsEarned, isFirstBlood ? 1 : 0]);
        await query('UPDATE users SET score = score + $1 WHERE id = $2', [pointsEarned, req.user.id]);

        res.json({
            message: isFirstBlood
                ? `🩸 FIRST BLOOD! +${pointsEarned} pts (includes +${FIRST_BLOOD_BONUS} first blood bonus)`
                : `Flag correct! +${pointsEarned} pts`,
            correct: true,
            points: pointsEarned,
            firstBlood: isFirstBlood
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await query('SELECT username, score FROM users ORDER BY score DESC LIMIT 10');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/challenges', async (req, res) => {
    try {
        const result = await query('SELECT challenge_id, COUNT(*) as solvecount FROM solves GROUP BY challenge_id');
        const solveCounts = {};
        result.rows.forEach(r => { solveCounts[r.challenge_id] = parseInt(r.solvecount); });

        const info = challenges.map(c => ({
            id: c.id,
            currentPoints: calcPoints(c, solveCounts[c.id] || 0),
            basePoints: c.basePoints,
            solves: solveCounts[c.id] || 0
        }));
        res.json(info);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
