const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
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

const db = new sqlite3.Database('./stegano.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            score INTEGER DEFAULT 0
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS solves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            challenge_id INTEGER,
            points_awarded INTEGER DEFAULT 0,
            first_blood INTEGER DEFAULT 0,
            solved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);
    }
});

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


app.post('/api/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Discord username required' });
    
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        if (user) {
            
            const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
            return res.json({ token, username: user.username });
        } else {
            
            db.run(`INSERT INTO users (username) VALUES (?)`, [username], function(err) {
                if (err) return res.status(500).json({ error: 'Error creating user' });
                
                const newUserId = this.lastID;
                const token = jwt.sign({ id: newUserId, username }, JWT_SECRET, { expiresIn: '24h' });
                return res.status(201).json({ token, username });
            });
        }
    });
});

app.get('/api/me', authenticateToken, (req, res) => {
    db.all(`SELECT challenge_id FROM solves WHERE user_id = ?`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        const solvedIds = rows.map(row => row.challenge_id);
        res.json({ username: req.user.username, solved: solvedIds });
    });
});


const FIRST_BLOOD_BONUS = 50; 

const challenges = [
    { id: 1, flag: process.env.FLAG_1, basePoints: 100,  decrement: 8,  minPercent: 0.25 },
    { id: 2, flag: process.env.FLAG_2, basePoints: 250,  decrement: 15, minPercent: 0.25 },
    { id: 3, flag: process.env.FLAG_3, basePoints: 300,  decrement: 20, minPercent: 0.25 },
    { id: 4, flag: process.env.FLAG_4, basePoints: 100,  decrement: 8,  minPercent: 0.25 }
];

function calcPoints(challenge, solveCount) {
    const minPoints = Math.floor(challenge.basePoints * challenge.minPercent);
    const current = challenge.basePoints - (solveCount * challenge.decrement);
    return Math.max(current, minPoints);
}

app.post('/api/submit', authenticateToken, (req, res) => {
    const { challengeId, flag } = req.body;
    
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    if (challenge.flag !== flag) {
        return res.status(400).json({ error: 'Incorrect flag! Keep digging.', correct: false });
    }

    // Check if this user already solved it
    db.get(`SELECT * FROM solves WHERE user_id = ? AND challenge_id = ?`, [req.user.id, challengeId], (err, existing) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (existing) return res.status(400).json({ error: 'Already solved this case.', correct: true });

        // Count total solves for this challenge (to calculate current point value)
        db.get(`SELECT COUNT(*) as count FROM solves WHERE challenge_id = ?`, [challengeId], (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error' });

            const solveCount = row.count;
            const isFirstBlood = solveCount === 0;
            const pointsEarned = calcPoints(challenge, solveCount) + (isFirstBlood ? FIRST_BLOOD_BONUS : 0);

            db.run(
                `INSERT INTO solves (user_id, challenge_id, points_awarded, first_blood) VALUES (?, ?, ?, ?)`,
                [req.user.id, challengeId, pointsEarned, isFirstBlood ? 1 : 0],
                (err) => {
                    if (err) return res.status(500).json({ error: 'Database error recording solve' });

                    db.run(`UPDATE users SET score = score + ? WHERE id = ?`, [pointsEarned, req.user.id], (err) => {
                        if (err) return res.status(500).json({ error: 'Database error updating score' });

                        res.json({
                            message: isFirstBlood
                                ? `🩸 FIRST BLOOD! +${pointsEarned} pts (includes +${FIRST_BLOOD_BONUS} first blood bonus)`
                                : `Flag correct! +${pointsEarned} pts`,
                            correct: true,
                            points: pointsEarned,
                            firstBlood: isFirstBlood
                        });
                    });
                }
            );
        });
    });
});

app.get('/api/leaderboard', (req, res) => {
    db.all(`SELECT username, score FROM users ORDER BY score DESC LIMIT 10`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
});

app.get('/api/challenges', (req, res) => {
    db.all(`SELECT challenge_id, COUNT(*) as solveCount FROM solves GROUP BY challenge_id`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });

        const solveCounts = {};
        rows.forEach(r => { solveCounts[r.challenge_id] = r.solveCount; });

        const info = challenges.map(c => ({
            id: c.id,
            currentPoints: calcPoints(c, solveCounts[c.id] || 0),
            basePoints: c.basePoints,
            solves: solveCounts[c.id] || 0
        }));

        res.json(info);
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
