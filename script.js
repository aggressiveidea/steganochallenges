document.addEventListener('DOMContentLoaded', () => {
    // Automatically use the same host as the page (works locally AND on Render)
    const API_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}/api`.replace(':80/api', '/api').replace(':443/api', '/api');

    let userToken = localStorage.getItem('token');
    let username = localStorage.getItem('username');
    let solvedChallenges = [];
    let currentChallengeId = null;

    const challenges = [
        {
            id: 1, title: 'Boulbina',
            description: 'During a decisive moment in the Algeria vs DR Congo match in AFCON 2025, a mysterious file "Boulbina.jif" was recovered. The last-minute hero of the 119th minute left behind a hidden trace...',
            difficulty: 'Easy', points: 100, file: 'Boulbina.gif'
        },
        {
            id: 2, title: 'Dance Death',
            description: 'We intercepted this image from a known DEADFACE affiliate. Some tool was used to conceal a file within it. Unlike simpler images, this one requires a passphrase — likely related to the image itself.',
            difficulty: 'Medium', points: 250, file: 'deathdance.png'
        },
        {
            id: 3, title: 'Lost Image',
            description: 'This is not just a steganography challenge — catch me if you can, Mr. Holmes! You will be provided both the image and a Python script.',
            difficulty: 'Medium', points: 300, file: 'lost.png'
        },
        {
            id: 4, title: 'Meow',
            description: 'Something is hidden deep within this audio file. Listen carefully — or perhaps use a different kind of ear altogether. Can you extract the flag?',
            difficulty: 'Easy', points: 100, file: 'meow.wav'
        }
    ];

    const challengeGrid = document.getElementById('challenge-grid');
    const loginPrompt = document.getElementById('login-prompt');
    const userDisplay = document.getElementById('user-display');
    const authBtn = document.getElementById('auth-btn');

    const challengeModal = document.getElementById('challenge-modal');
    const authModal = document.getElementById('auth-modal');
    const lbModal = document.getElementById('lb-modal');

    // ------- Auth Status -------
    async function checkAuthStatus() {
        if (userToken) {
            try {
                const res = await fetch(`${API_URL}/me`, { headers: { 'Authorization': `Bearer ${userToken}` }});
                if (res.ok) {
                    const data = await res.json();
                    solvedChallenges = data.solved;
                } else { logout(); return; }
            } catch(e) { /* server offline */ }

            userDisplay.textContent = `⚔ ${username}`;
            authBtn.textContent = 'Logout';
            loginPrompt.style.display = 'none';
            challengeGrid.style.display = 'grid';
            renderCards();
        } else {
            userDisplay.textContent = 'Wanderer';
            authBtn.textContent = '⚗ Begin';
            loginPrompt.style.display = 'flex';
            challengeGrid.style.display = 'none';
        }
    }

    function logout() {
        userToken = null; username = null;
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        checkAuthStatus();
    }

    // ------- Render Cards -------
    async function renderCards() {
        // Fetch live point values from server
        let livePoints = {};
        try {
            const res = await fetch(`${API_URL}/challenges`);
            if (res.ok) {
                const data = await res.json();
                data.forEach(c => { livePoints[c.id] = { pts: c.currentPoints, solves: c.solves }; });
            }
        } catch(e) { /* offline - use static values */ }

        challengeGrid.innerHTML = '';
        challenges.forEach((c, i) => {
            const solved = solvedChallenges.includes(c.id);
            const live = livePoints[c.id] || { pts: c.points, solves: 0 };
            const isFirst = live.solves === 0; // Nobody solved it yet = first blood available

            const card = document.createElement('div');
            card.className = `challenge-card${solved ? ' solved' : ''}`;
            card.innerHTML = `
                <p class="card-num">CASE ${String(i + 1).padStart(2, '0')} ${solved ? '— ✓ SOLVED' : ''}</p>
                <h3 class="card-title">${c.title}</h3>
                <p class="card-desc">${c.description}</p>
                <div class="card-footer">
                    <span class="diff-badge ${badgeClass(c.difficulty)}">${c.difficulty}</span>
                    <span class="card-pts">${live.pts} pts${isFirst && !solved ? ' 🩸' : ''}</span>
                </div>`;
            card.addEventListener('click', () => openModal(c, solved, live.pts));
            challengeGrid.appendChild(card);
        });
    }

    function badgeClass(diff) {
        return { Easy: 'badge-easy', Medium: 'badge-medium', Hard: 'badge-hard', Nightmare: 'badge-hard' }[diff] || 'badge-easy';
    }

    // ------- Challenge Modal -------
    function openModal(c, solved, livePoints) {
        currentChallengeId = c.id;
        document.getElementById('modal-title').textContent = c.title;
        document.getElementById('modal-desc').textContent = c.description;
        document.getElementById('modal-pts-display').textContent = `${livePoints !== undefined ? livePoints : c.points} Points`;

        const badge = document.getElementById('modal-badge');
        badge.textContent = c.difficulty;
        badge.className = `diff-badge ${badgeClass(c.difficulty)}`;

        const dlBtn = document.getElementById('download-btn');
        const subArea = document.getElementById('submission-area');
        const startWrap = document.getElementById('start-btn-wrap');
        const startBtn = document.getElementById('start-btn');
        const subMsg = document.getElementById('submission-msg');
        document.getElementById('flag-input').value = '';
        subMsg.textContent = '';

        dlBtn.style.display = 'none';
        subArea.style.display = 'none';
        startWrap.style.display = 'none';

        if (!userToken) {
            startWrap.style.display = 'block';
            startBtn.textContent = '🔒 Login to access case files';
        } else if (solved) {
            dlBtn.href = `${API_URL.replace('/api', '')}/challenges/${c.file}`;
            dlBtn.download = c.file;
            dlBtn.style.display = 'block';
            startWrap.style.display = 'block';
            startBtn.textContent = '✓ Case Solved';
        } else {
            dlBtn.href = `${API_URL.replace('/api', '')}/challenges/${c.file}`;
            dlBtn.download = c.file;
            dlBtn.style.display = 'block';
            subArea.style.display = 'flex';
            subArea.style.flexDirection = 'column';
            subArea.style.gap = '10px';
        }

        challengeModal.classList.add('active');
    }

    // ------- Flag Submission -------
    document.getElementById('submit-flag-btn').addEventListener('click', async () => {
        const flag = document.getElementById('flag-input').value.trim();
        const msg = document.getElementById('submission-msg');
        if (!flag) return;

        try {
            const res = await fetch(`${API_URL}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
                body: JSON.stringify({ challengeId: currentChallengeId, flag })
            });
            const data = await res.json();
            if (res.ok) {
                msg.textContent = data.message;
                msg.style.color = data.firstBlood ? '#ff4444' : '#5dc97a';
                checkAuthStatus();
            } else {
                msg.textContent = `✗ ${data.error}`;
                msg.style.color = '#c0392b';
            }
        } catch(e) { msg.textContent = 'Server unreachable.'; msg.style.color = '#c0392b'; }
    });

    // ------- Auth -------
    authBtn.addEventListener('click', () => { if (userToken) logout(); else authModal.classList.add('active'); });

    document.getElementById('login-submit-btn').addEventListener('click', async () => {
        const u = document.getElementById('auth-username').value.trim();
        const msg = document.getElementById('auth-msg');
        if (!u) { msg.textContent = 'Please enter a username.'; msg.style.color = '#c0392b'; return; }

        try {
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: u })
            });
            const data = await res.json();
            if (res.ok) {
                userToken = data.token; username = data.username;
                localStorage.setItem('token', userToken);
                localStorage.setItem('username', username);
                authModal.classList.remove('active');
                checkAuthStatus();
            } else { msg.textContent = data.error; msg.style.color = '#c0392b'; }
        } catch(e) { msg.textContent = 'Server unreachable.'; msg.style.color = '#c0392b'; }
    });

    // ------- Leaderboard -------
    document.getElementById('leaderboard-btn').addEventListener('click', async () => {
        lbModal.classList.add('active');
        const tbody = document.querySelector('#leaderboard-table tbody');
        tbody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
        try {
            const res = await fetch(`${API_URL}/leaderboard`);
            const rows = await res.json();
            tbody.innerHTML = rows.length
                ? rows.map((r, i) => `<tr><td>#${i + 1}</td><td>${r.username}</td><td>${r.score}</td></tr>`).join('')
                : '<tr><td colspan="3">No investigators yet.</td></tr>';
        } catch(e) { tbody.innerHTML = '<tr><td colspan="3">Could not load data.</td></tr>'; }
    });

    // ------- Close Modals -------
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.modal-overlay').classList.remove('active'));
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('active'); });
    });

    checkAuthStatus();
});
